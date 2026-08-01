//! Shared fixtures, generated keys, and an INDEPENDENT signature checker.
//!
//! The checker deliberately avoids this crate's own accessors: it re-reads
//! the `/ByteRange` array and the `/Contents` window out of the finished
//! bytes and verifies the signature from those. A suite that checked the
//! signer using the numbers the signer returned would agree with itself no
//! matter what it got wrong — and "the ranges say one thing while the file
//! says another" is precisely the failure that matters here.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use cms::content_info::ContentInfo;
use cms::signed_data::SignedData;
use der::{Decode, Encode, SliceReader};
use ring::digest::{digest, SHA256};
use ring::signature::{
    UnparsedPublicKey, VerificationAlgorithm, ECDSA_P256_SHA256_ASN1, RSA_PKCS1_2048_8192_SHA256,
};
use shojiku_signing::LocalPemSigner;

/// Reads a committed example's rendered output — real engine output, pinned
/// byte-identical by the examples gate.
pub fn example(relative: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples")
        .join(relative);
    std::fs::read(&path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()))
}

/// Every bundled shape the suite signs: a single page without annotations, a
/// multi-page document whose pages carry link annotations, and a dense form.
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

/// The generated key directory for this test process.
fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-sign-e2e-keys-{}", std::process::id()));
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

/// A signer over one of the generated key pairs.
pub fn signer(stem: &str) -> LocalPemSigner {
    LocalPemSigner::new(
        &key_file(&format!("{stem}.key.pem")),
        None,
        &key_file(&format!("{stem}.cert.pem")),
    )
    .expect("the generated key pair loads")
}

/// The verification algorithm matching a generated key pair.
pub fn verifier(stem: &str) -> &'static dyn VerificationAlgorithm {
    if stem.starts_with("ec") {
        &ECDSA_P256_SHA256_ASN1
    } else {
        &RSA_PKCS1_2048_8192_SHA256
    }
}

/// The `/ByteRange` array a signed document declares, read from its bytes.
pub fn declared_ranges(signed: &[u8]) -> [usize; 4] {
    let at = find(signed, b"/ByteRange [").expect("a byte-range array") + b"/ByteRange [".len();
    let text = core::str::from_utf8(&signed[at..at + 43]).expect("the fields are ASCII");
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
    range
}

/// The bytes the declared ranges actually cover, concatenated in order.
pub fn covered_bytes(signed: &[u8]) -> Vec<u8> {
    let [first_at, first_len, second_at, second_len] = declared_ranges(signed);
    let mut covered = Vec::new();
    covered.extend_from_slice(&signed[first_at..first_at + first_len]);
    covered.extend_from_slice(&signed[second_at..second_at + second_len]);
    covered
}

/// The signature container inside a signed document's `/Contents` window.
pub fn container_in(signed: &[u8]) -> SignedData {
    // Anchored on `/ByteRange`, which only the signature dictionary carries.
    // A plain search for `/Contents ` finds a PAGE's content stream first in
    // any real rendered document — the emitted dictionary writes the two keys
    // adjacently, so searching forward from the range array lands on the
    // signature's own window.
    let dictionary =
        find(signed, b"/ByteRange [").expect("a signature dictionary") + b"/ByteRange [".len();
    let open = dictionary
        + find(&signed[dictionary..], b"/Contents ").expect("a contents window")
        + b"/Contents ".len();
    assert_eq!(signed[open], b'<');
    let close = signed[open..]
        .iter()
        .position(|byte| *byte == b'>')
        .expect("the window is closed")
        + open;
    let der: Vec<u8> = signed[open + 1..close]
        .chunks_exact(2)
        .map(|pair| {
            let text = core::str::from_utf8(pair).expect("hexadecimal is ASCII");
            u8::from_str_radix(text, 16).expect("hexadecimal digits")
        })
        .collect();
    // One value, not the whole slice: the window is zero-padded after the
    // container, exactly as a reader expects, so a strict whole-buffer decode
    // would call that padding trailing data.
    let mut reader = SliceReader::new(&der).expect("the window holds bytes");
    let info = ContentInfo::decode(&mut reader).expect("the window holds a container");
    info.content
        .decode_as::<SignedData>()
        .expect("the content is signed data")
}

/// Checks a signed document the way a verifier would: the digest inside the
/// container must be the digest of the bytes the document says are covered,
/// and the signature must check out against the certificate it ships with.
pub fn assert_verifies(signed: &[u8], stem: &str) {
    // First: the finished bytes are still a document the reader opens. A
    // signature over a file no reader can parse is worthless however valid
    // its cryptography, so every combination that reaches this checker also
    // proves two-revision readability.
    shojiku_signing::PdfDocument::parse(signed).expect("the signed document still parses");
    let expected = digest(&SHA256, &covered_bytes(signed));
    let data = container_in(signed);
    let signer_info = data.signer_infos.0.as_ref().first().expect("one signer");
    let attributes = signer_info
        .signed_attrs
        .as_ref()
        .expect("signed attributes");
    let to_be_signed = attributes.to_der().expect("re-encoding the attributes");
    assert!(
        to_be_signed.windows(32).any(|w| w == expected.as_ref()),
        "the container's digest is not the digest of the covered bytes"
    );

    let certificates = data.certificates.as_ref().expect("a certificate set");
    let cms::cert::CertificateChoices::Certificate(certificate) =
        certificates.0.as_ref().first().expect("one certificate")
    else {
        panic!("an unexpected certificate choice");
    };
    let public_key = certificate
        .tbs_certificate
        .subject_public_key_info
        .subject_public_key
        .as_bytes()
        .expect("the public key is whole bytes");
    UnparsedPublicKey::new(verifier(stem), public_key)
        .verify(&to_be_signed, signer_info.signature.as_bytes())
        .unwrap_or_else(|_| panic!("the signature should verify ({stem})"));
}

/// Position of the FIRST occurrence of `needle`.
pub fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
