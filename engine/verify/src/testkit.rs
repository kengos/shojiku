//! Test-only fixtures: minimal signable documents, and signed ones.
//!
//! Unit tests need documents whose every byte is known, which committed
//! example output cannot give them — a hostile-shape test has to say exactly
//! which byte is wrong. The builder emits the same shape a rendered document
//! has (a classic cross-reference table and trailer), so a unit test and a
//! real file exercise one code path; the near-e2e suite in `tests/` runs the
//! same checks over committed example output.
//!
//! Key material lives in [`keys`], which GENERATES it — nothing here is
//! committed.

use shojiku_signing::{sign_document, PlaceholderOptions};

pub(crate) mod keys;

/// Lays out `objects` and writes a cross-reference table and trailer.
pub(crate) fn build_pdf(objects: &[(u32, &str)], root: u32) -> Vec<u8> {
    let mut out = Vec::from(b"%PDF-1.7\n".as_slice());
    let mut offsets: Vec<(u32, usize)> = Vec::new();
    for (number, body) in objects {
        offsets.push((*number, out.len()));
        out.extend_from_slice(format!("{number} 0 obj\n{body}\nendobj\n").as_bytes());
    }
    let xref = out.len();
    let highest = objects.iter().map(|(number, _)| *number).max().unwrap_or(0);
    out.extend_from_slice(format!("xref\n0 {}\n", highest + 1).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f\r\n");
    for number in 1..=highest {
        let offset = offsets
            .iter()
            .find(|(n, _)| *n == number)
            .map_or(0, |(_, offset)| *offset);
        out.extend_from_slice(format!("{offset:010} 00000 n\r\n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<</Size {}/Root {root} 0 R/ID [(a)(a)]>>\nstartxref\n{xref}\n%%EOF",
            highest + 1
        )
        .as_bytes(),
    );
    out
}

/// A one-page document with no annotations — the shape the signer expects.
pub(crate) fn simple_pdf() -> Vec<u8> {
    build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
            (2, "<</Type/Page/Parent 1 0 R/MediaBox[0 0 595 842]>>"),
            (3, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        3,
    )
}

/// [`simple_pdf`] signed with the key pair named by `stem`.
pub(crate) fn signed_pdf(stem: &str) -> Vec<u8> {
    signed_by(&keys::signer(stem))
}

/// [`simple_pdf`] signed by `signer`.
pub(crate) fn signed_by(signer: &shojiku_signing::LocalPemSigner) -> Vec<u8> {
    sign_document(&simple_pdf(), signer, &PlaceholderOptions::default())
        .expect("the fixture document signs")
}

/// The container inside a document signed with `stem`.
pub(crate) fn container(stem: &str) -> crate::container::Container {
    container_and_covered(stem).0
}

/// The container inside a document signed with `stem`, paired with the bytes
/// that document says its signature covers.
pub(crate) fn container_and_covered(stem: &str) -> (crate::container::Container, Vec<u8>) {
    parts(&signed_pdf(stem))
}

/// The container and covered bytes of an already-signed document.
pub(crate) fn parts(pdf: &[u8]) -> (crate::container::Container, Vec<u8>) {
    let document = shojiku_signing::PdfDocument::parse(pdf).expect("the signed fixture parses");
    let located = crate::locate::locate(pdf, &document).expect("it carries a signature");
    let der = crate::container::decode_window(pdf, &located.contents).expect("the window decodes");
    let range = crate::range::parse_byte_range(&located.dict).expect("it declares a range");
    (
        crate::container::parse(&der).expect("the container decodes"),
        crate::range::covered_bytes(pdf, range).expect("the ranges lie inside the document"),
    )
}

/// Where a signed document's `/ByteRange` fields and `/Contents` window sit,
/// read back out of the finished bytes.
///
/// Read from the FILE rather than from what signing returned, deliberately:
/// a fixture built out of the numbers the signer handed back would agree
/// with the signer no matter what either got wrong.
pub(crate) struct Layout {
    /// Offset of the first `/ByteRange` digit.
    pub(crate) range_at: usize,
    /// The four declared fields.
    pub(crate) range: [usize; 4],
    /// The hexadecimal digits inside the window, excluding both brackets.
    pub(crate) window: core::ops::Range<usize>,
}

/// Reads a signed document's layout back out of its bytes.
pub(crate) fn layout(pdf: &[u8]) -> Layout {
    // Anchored on `/ByteRange`, which only a signature dictionary carries —
    // a plain search for `/Contents ` finds a page's content stream first in
    // any real rendered document.
    let marker = b"/ByteRange [";
    let range_at = find(pdf, marker).expect("a byte-range array") + marker.len();
    let text = core::str::from_utf8(&pdf[range_at..range_at + 43]).expect("the fields are ASCII");
    let mut fields = text.split_whitespace().map(|field| {
        field
            .trim_end_matches(']')
            .parse::<usize>()
            .expect("a decimal field")
    });
    let mut range = [0usize; 4];
    for slot in &mut range {
        *slot = fields.next().expect("four fields");
    }
    let open = range_at + find(&pdf[range_at..], b"/Contents ").expect("a window") + 10;
    let close = pdf[open..]
        .iter()
        .position(|byte| *byte == b'>')
        .expect("the window is closed")
        + open;
    Layout {
        range_at,
        range,
        window: open + 1..close,
    }
}

/// Position of the first occurrence of `needle`.
pub(crate) fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// A document carrying a GENUINELY VALID signature over an incomplete range.
///
/// This is the forgery the coverage check exists to catch, and it has to be
/// built rather than described: the `/ByteRange` array is shortened so one
/// byte before the signature window goes unsigned, and then the signature is
/// computed over the shortened ranges. Every cryptographic check passes. The
/// only thing wrong with the document is what it left out.
pub(crate) fn interior_gap_forgery(stem: &str) -> Vec<u8> {
    use ring::digest::{digest, SHA256};
    use shojiku_signing::{SignatureContainer, Signer};

    let mut pdf = signed_pdf(stem);
    let before = layout(&pdf);
    // One byte of the document, immediately before the window, drops out of
    // the claim. Ten digits wide, so nothing after it moves.
    let shortened = before.range[1] - 1;
    let field = format!("{shortened:010}");
    pdf[before.range_at + 11..before.range_at + 21].copy_from_slice(field.as_bytes());

    let after = layout(&pdf);
    assert_eq!(after.range[1], shortened, "the field was patched in place");
    let mut covered = Vec::new();
    covered.extend_from_slice(&pdf[after.range[0]..after.range[0] + after.range[1]]);
    covered.extend_from_slice(&pdf[after.range[2]..after.range[2] + after.range[3]]);

    let signer = keys::signer(stem);
    let container = SignatureContainer::new(
        signer.certificate_pem(),
        digest(&SHA256, &covered).as_ref(),
        signer.algorithm(),
    )
    .expect("the container builds");
    let signature = signer
        .sign(&container.to_be_signed().expect("the attributes encode"))
        .expect("the fixture key signs");
    let der = container.finish(&signature).expect("the container encodes");
    write_window(&mut pdf, &after.window, &der);
    pdf
}

/// Writes `der` as uppercase hexadecimal into `window`, leaving the padding.
fn write_window(pdf: &mut [u8], window: &core::ops::Range<usize>, der: &[u8]) {
    const DIGITS: &[u8; 16] = b"0123456789ABCDEF";
    let characters = der.iter().flat_map(|byte| {
        [
            DIGITS[usize::from(byte >> 4)],
            DIGITS[usize::from(byte & 0x0f)],
        ]
    });
    for (slot, character) in pdf[window.start..window.end].iter_mut().zip(characters) {
        *slot = character;
    }
}

/// The raw DER inside a signed document's `/Contents` window.
pub(crate) fn container_der(pdf: &[u8]) -> Vec<u8> {
    let document = shojiku_signing::PdfDocument::parse(pdf).expect("the signed fixture parses");
    let located = crate::locate::locate(pdf, &document).expect("it carries a signature");
    crate::container::decode_window(pdf, &located.contents).expect("the window decodes")
}
