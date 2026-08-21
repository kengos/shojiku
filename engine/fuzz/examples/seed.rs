//! Grows the corpus with the seeds that may not be committed.
//!
//! A signed document embeds a certificate, and the signing track forbids
//! committed key material — so the inputs that actually reach the
//! interesting code (a real signature dictionary, a real CMS container) have
//! to be produced at fuzz time instead. `make engine:fuzz` runs this first.
//!
//! Everything written here is prefixed `generated-` and gitignored; the
//! committed seeds beside them are structural only. Without this step a
//! mutating fuzzer would spend its whole budget failing to invent a valid
//! cross-reference table, and the container parsers would never run at all.

use std::fs;
use std::path::PathBuf;

use shojiku_signing::{
    complete_sign, prepare_sign, LocalPemSigner, PlaceholderOptions, SignatureContainer, Signer,
};

fn main() {
    let key = shojiku_fuzz::read("rsa2048.key.pem");
    let certificate = shojiku_fuzz::read("rsa2048.cert.pem");
    let signer = LocalPemSigner::new(&key, None, &certificate).expect("the generated key loads");

    let options = PlaceholderOptions::default();
    let prepared = prepare_sign(&simple_pdf(), &options).expect("the document prepares");
    let container = SignatureContainer::new(
        signer.certificate_pem(),
        prepared.digest(),
        signer.algorithm(),
    )
    .expect("the container builds");
    let signature = signer
        .sign(&container.to_be_signed().expect("the attributes encode"))
        .expect("the signature is produced");
    let der = container.finish(&signature).expect("the container encodes");
    let signed = complete_sign(prepared, &der).expect("the signature fits");

    let mut window = vec![b'<'];
    for byte in &der {
        window.extend_from_slice(format!("{byte:02x}").as_bytes());
    }
    window.push(b'>');

    write("pdf_document", "generated-signed.pdf", &signed);
    write("verify_document", "generated-signed.pdf", &signed);
    write("cms_container", "generated-container.der", &der);
    write("contents_window", "generated-window.hex", &window);
    write("trust_anchors", "generated-anchor.pem", &certificate);
}

/// Writes one seed into a target's corpus directory.
fn write(target: &str, name: &str, bytes: &[u8]) {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("corpus")
        .join(target);
    fs::create_dir_all(&dir).expect("the corpus directory");
    fs::write(dir.join(name), bytes).expect("writing a seed");
    println!("seed: {target}/{name} ({} bytes)", bytes.len());
}

/// The smallest document this engine's signer accepts: one page, a catalog,
/// a classic cross-reference table. The same shape a rendered file has,
/// which is what makes it a useful starting point for mutation.
fn simple_pdf() -> Vec<u8> {
    let objects = [
        (1u32, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R/MediaBox[0 0 595 842]>>"),
        (3, "<</Type/Catalog/Pages 1 0 R>>"),
    ];
    let mut out = Vec::from(b"%PDF-1.7\n".as_slice());
    let mut offsets: Vec<usize> = Vec::new();
    for (number, body) in objects {
        offsets.push(out.len());
        out.extend_from_slice(format!("{number} 0 obj\n{body}\nendobj\n").as_bytes());
    }
    let xref = out.len();
    let size = objects.len() + 1;
    out.extend_from_slice(format!("xref\n0 {size}\n0000000000 65535 f\r\n").as_bytes());
    for offset in offsets {
        out.extend_from_slice(format!("{offset:010} 00000 n\r\n").as_bytes());
    }
    out.extend_from_slice(
        format!("trailer\n<</Size {size}/Root 3 0 R/ID [(a)(a)]>>\nstartxref\n{xref}\n%%EOF")
            .as_bytes(),
    );
    out
}
