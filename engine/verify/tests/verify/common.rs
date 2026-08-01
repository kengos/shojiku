//! Shared fixtures: committed example output, generated keys, signed
//! documents, and where a signature sits inside one.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use shojiku_signing::{sign_document, LocalPemSigner, PlaceholderOptions};
use shojiku_verify::TrustAnchors;

/// Reads a committed example's rendered output — real engine output, pinned
/// byte-identical by the examples gate.
pub fn example(relative: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples")
        .join(relative);
    std::fs::read(&path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()))
}

/// Every bundled shape the suite verifies: a single page without
/// annotations, a multi-page document whose pages carry link annotations,
/// and a dense form.
pub fn bundled_examples() -> Vec<(&'static str, Vec<u8>)> {
    [
        "business/receipt-ja/output.pdf",
        "business/catalog-ja/output.pdf",
        "forms/rirekisho-ja/output.pdf",
    ]
    .into_iter()
    .map(|name| (name, example(name)))
    .collect()
}

/// Every key pair the signer ships, by fixture stem.
pub const ALGORITHMS: [&str; 3] = ["rsa2048", "ec256", "rsa4096"];

/// The generated key directory for this test process.
///
/// Memoized around the GENERATOR, not merely around the path: the script
/// writes its completion sentinel last, so a second concurrent run would
/// rewrite files under a test already reading them.
fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-verify-e2e-keys-{}", std::process::id()));
        let script =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
        let output = Command::new("sh")
            .arg(&script)
            .arg(&dir)
            .output()
            .unwrap_or_else(|error| panic!("could not run {}: {error}", script.display()));
        assert!(
            output.status.success(),
            "{} failed: {}",
            script.display(),
            String::from_utf8_lossy(&output.stderr)
        );
        dir
    })
}

/// Reads one generated key file.
pub fn key_file(name: &str) -> Vec<u8> {
    let path = key_dir().join(name);
    std::fs::read(&path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()))
}

/// A signer holding `key_stem`'s key and `cert_stem`'s certificate.
pub fn signer_with(key_stem: &str, cert_stem: &str) -> LocalPemSigner {
    LocalPemSigner::new(
        &key_file(&format!("{key_stem}.key.pem")),
        None,
        &key_file(&format!("{cert_stem}.cert.pem")),
    )
    .expect("the generated key pair loads")
}

/// Trust anchors holding the certificate named by `stem`.
pub fn anchors(stem: &str) -> TrustAnchors {
    TrustAnchors::from_pem(&key_file(&format!("{stem}.cert.pem"))).expect("the certificate loads")
}

/// Signs `pdf` with the key pair named by `stem`.
pub fn sign(pdf: &[u8], stem: &str) -> Vec<u8> {
    sign_document(
        pdf,
        &signer_with(stem, stem),
        &PlaceholderOptions::default(),
    )
    .expect("a bundled example signs")
}

/// The `/ByteRange` array and `/Contents` window of a signed document, read
/// back out of its own bytes.
///
/// Anchored on `/ByteRange`, which only a signature dictionary carries: a
/// plain search for `/Contents ` finds a PAGE's content stream first in any
/// real rendered document, and every document in this suite is a real one.
pub struct Layout {
    pub range: [usize; 4],
    pub window: core::ops::Range<usize>,
}

/// Reads a signed document's layout.
pub fn layout(pdf: &[u8]) -> Layout {
    let marker = b"/ByteRange [";
    let at = find(pdf, marker).expect("a byte-range array") + marker.len();
    let text = core::str::from_utf8(&pdf[at..at + 43]).expect("the fields are ASCII");
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
    let open = at + find(&pdf[at..], b"/Contents ").expect("a window") + 10;
    let close = pdf[open..]
        .iter()
        .position(|byte| *byte == b'>')
        .expect("the window is closed")
        + open;
    Layout {
        range,
        window: open + 1..close,
    }
}

/// Position of the first occurrence of `needle`.
pub fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
