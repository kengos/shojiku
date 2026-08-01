//! Test-only fixture builders: minimal but genuinely well-formed documents.
//!
//! Unit tests need documents whose every byte is known, which committed
//! example output cannot give them. These builders emit the same shape a
//! rendered document has — a classic cross-reference table and trailer — so a
//! parser test and a real file exercise the same code paths.
//!
//! Key material lives in [`keys`], which generates it rather than reading it
//! from the repository.

pub(crate) mod keys;

/// Lays out `objects` and writes a cross-reference table and trailer for them.
pub(crate) fn build_pdf(objects: &[(u32, &str)], root: u32) -> Vec<u8> {
    build_pdf_with_size(objects, root, None)
}

/// As [`build_pdf`], with the trailer's `/Size` overridden.
pub(crate) fn build_pdf_with_size(
    objects: &[(u32, &str)],
    root: u32,
    size: Option<u32>,
) -> Vec<u8> {
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
    let declared = size.unwrap_or(highest + 1);
    out.extend_from_slice(
        format!(
            "trailer\n<</Size {declared}/Root {root} 0 R/ID [(a)(a)]>>\nstartxref\n{xref}\n%%EOF"
        )
        .as_bytes(),
    );
    out
}

/// A one-page document with no annotations.
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

/// A one-page document whose page already carries an annotation array, the
/// shape a rendered document with links has.
pub(crate) fn pdf_with_annots() -> Vec<u8> {
    build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
            (
                2,
                "<</Type/Page/Parent 1 0 R/Annots[4 0 R]/MediaBox[0 0 595 842]>>",
            ),
            (3, "<</Type/Catalog/Pages 1 0 R>>"),
            (4, "<</Type/Annot/Subtype/Link/Rect[0 0 10 10]>>"),
        ],
        3,
    )
}
