//! Signing a document and reading the result back the way a verifier would.

use cms::content_info::ContentInfo;
use cms::signed_data::SignedData;
use der::{Decode, SliceReader};
use ring::digest::{digest, SHA256};
use ring::signature::{VerificationAlgorithm, ECDSA_P256_SHA256_ASN1, RSA_PKCS1_2048_8192_SHA256};

use super::signer;
use crate::key::SignatureAlgorithm;
use crate::placeholder::PlaceholderOptions;
use crate::sign::sign_document;
use crate::signer::{LocalPemSigner, Signer};
use crate::testkit::keys::keys;
use crate::testkit::simple_pdf;

/// Finds the signature container inside a signed document and decodes it.
///
/// Read out of the raw bytes rather than kept from the signing call: this is
/// the only way to check that what a verifier will find is what was meant.
fn container_in(signed: &[u8]) -> SignedData {
    // Anchored on `/ByteRange` rather than searching for `/Contents ` from
    // the start: this fixture has no page content stream, but a real rendered
    // document does, and the first match there is the page's.
    let dictionary = signed
        .windows(12)
        .position(|w| w == b"/ByteRange [")
        .expect("the signed document carries a signature dictionary");
    let open = dictionary
        + signed[dictionary..]
            .windows(10)
            .position(|w| w == b"/Contents ")
            .expect("the signature dictionary has a contents window")
        + 10;
    assert_eq!(signed[open], b'<');
    let close = signed[open..]
        .iter()
        .position(|byte| *byte == b'>')
        .expect("the window is closed")
        + open;
    let hex: Vec<u8> = signed[open + 1..close]
        .chunks_exact(2)
        .map(|pair| {
            let text = core::str::from_utf8(pair).expect("hexadecimal is ASCII");
            u8::from_str_radix(text, 16).expect("hexadecimal digits")
        })
        .collect();
    // Decoded as ONE value rather than over the whole slice: the window is
    // padded with zeros after the container, and a strict whole-buffer decode
    // would report that padding as trailing data. A real verifier reads the
    // length from the container's own header exactly like this.
    let mut reader = SliceReader::new(&hex).expect("the window holds bytes");
    let info = ContentInfo::decode(&mut reader).expect("the window holds a container");
    info.content
        .decode_as::<SignedData>()
        .expect("the content is signed data")
}

/// The `/ByteRange` array a signed document declares.
fn declared_ranges(signed: &[u8]) -> [usize; 4] {
    let at = signed
        .windows(12)
        .position(|w| w == b"/ByteRange [")
        .expect("the signed document declares byte ranges")
        + 12;
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

/// Signs the fixture document with one of the generated key pairs.
fn sign_with(stem: &str) -> Vec<u8> {
    let options = PlaceholderOptions::with_contents_capacity(4096).expect("a legal capacity");
    sign_document(&simple_pdf(), &signer(stem), &options).expect("signing succeeds")
}

#[test]
fn a_signed_document_verifies_against_its_own_declared_ranges() {
    // The property everything else rests on, checked without using any of the
    // values the signing call returned: the ranges, the digest and the
    // signature are all re-read from the finished bytes.
    let cases: [(&str, &dyn VerificationAlgorithm); 2] = [
        ("rsa2048", &RSA_PKCS1_2048_8192_SHA256),
        ("ec256", &ECDSA_P256_SHA256_ASN1),
    ];
    for (stem, verifier) in cases {
        let signed = sign_with(stem);
        let [first_at, first_len, second_at, second_len] = declared_ranges(&signed);
        let mut covered = Vec::new();
        covered.extend_from_slice(&signed[first_at..first_at + first_len]);
        covered.extend_from_slice(&signed[second_at..second_at + second_len]);
        let expected = digest(&SHA256, &covered);

        let data = container_in(&signed);
        let signer_info = data.signer_infos.0.as_ref().first().expect("one signer");
        let attributes = signer_info
            .signed_attrs
            .as_ref()
            .expect("signed attributes");
        let to_be_signed = der::Encode::to_der(attributes).expect("re-encoding the attributes");

        // The digest inside the container is the digest of the covered bytes.
        assert!(
            to_be_signed.windows(32).any(|w| w == expected.as_ref()),
            "the container's digest does not match the document ({stem})"
        );

        let certificate = data
            .certificates
            .as_ref()
            .expect("the certificate travels with the signature");
        let cms::cert::CertificateChoices::Certificate(certificate) =
            certificate.0.as_ref().first().expect("one certificate")
        else {
            panic!("an unexpected certificate choice");
        };
        let public_key = certificate
            .tbs_certificate
            .subject_public_key_info
            .subject_public_key
            .as_bytes()
            .expect("the public key is whole bytes");
        ring::signature::UnparsedPublicKey::new(verifier, public_key)
            .verify(&to_be_signed, signer_info.signature.as_bytes())
            .unwrap_or_else(|_| panic!("the {stem} document should verify"));
    }
}

#[test]
fn the_declared_ranges_cover_the_whole_file_except_the_window() {
    let signed = sign_with("ec256");
    let [first_at, first_len, second_at, second_len] = declared_ranges(&signed);
    assert_eq!(first_at, 0);
    assert_eq!(
        first_len + second_len + (second_at - first_len),
        signed.len(),
        "the ranges plus the gap must account for every byte"
    );
    assert_eq!(second_at + second_len, signed.len());
    // The gap is the window including both angle brackets.
    assert_eq!(signed[first_len], b'<');
    assert_eq!(signed[second_at - 1], b'>');
}

#[test]
fn an_rsa_document_signs_to_the_same_bytes_every_time() {
    // No signing-time attribute and no nonce, so the whole pipeline is
    // reproducible — the same property the renderer promises.
    assert_eq!(sign_with("rsa2048"), sign_with("rsa2048"));
}

#[test]
fn an_ecdsa_document_differs_between_signings_but_stays_the_same_size() {
    // ECDSA draws a fresh nonce, so equality is not available here. The
    // window is fixed-width, so the file length must not move regardless.
    let first = sign_with("ec256");
    let second = sign_with("ec256");
    assert_ne!(first, second);
    assert_eq!(first.len(), second.len());
}

#[test]
fn an_encrypted_key_signs_the_same_document_as_its_plaintext_twin() {
    // The encrypted and unencrypted files hold one key, so the signature must
    // not depend on which one was on disk.
    let options = PlaceholderOptions::with_contents_capacity(4096).expect("a legal capacity");
    let encrypted = LocalPemSigner::new(
        &keys().read("rsa2048.enc.pem"),
        Some(&keys().passphrase()),
        &keys().read("rsa2048.cert.pem"),
    )
    .expect("the encrypted key loads");
    assert_eq!(encrypted.algorithm(), SignatureAlgorithm::RsaPkcs1Sha256);
    assert_eq!(
        sign_document(&simple_pdf(), &encrypted, &options).expect("signing succeeds"),
        sign_with("rsa2048")
    );
}
