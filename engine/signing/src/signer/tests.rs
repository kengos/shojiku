//! The signer that has already signed.
//!
//! What these pin is that the external route is not a second writer: a
//! signature produced outside this crate and handed back through
//! [`PresignedSigner`] must travel the SAME path a local key's does, and the
//! only way to state that as a test is byte equality against the local path.

use super::{LocalPemSigner, PresignedSigner, Signer};
use crate::cms::SignatureContainer;
use crate::key::{PrivateKey, SignatureAlgorithm};
use crate::placeholder::PlaceholderOptions;
use crate::sign::{prepare_sign, sign_document};
use crate::testkit::keys::keys;
use crate::testkit::simple_pdf;

/// Signs a document's prepared attributes with a key held OUTSIDE this
/// crate's signer — the stand-in for a cloud key service.
fn signature_from_elsewhere(pdf: &[u8], stem: &str, algorithm: SignatureAlgorithm) -> Vec<u8> {
    let prepared = prepare_sign(pdf, &PlaceholderOptions::default()).expect("preparing succeeds");
    let certificate = keys().read(&format!("{stem}.cert.pem"));
    let to_be_signed = SignatureContainer::new(&certificate, prepared.digest(), algorithm)
        .expect("the container starts")
        .to_be_signed()
        .expect("the attributes encode");
    PrivateKey::from_pem(&keys().read(&format!("{stem}.key.pem")), None)
        .expect("the key loads")
        .sign(&to_be_signed)
        .expect("the external signer produces a signature")
}

#[test]
fn a_presigned_signer_reports_what_it_was_built_from() {
    let certificate = keys().read("rsa2048.cert.pem");
    let signature = [0x01, 0x02, 0x03];
    let signer = PresignedSigner::new(
        SignatureAlgorithm::EcdsaP256Sha256,
        &certificate,
        &signature,
    );

    assert_eq!(signer.algorithm(), SignatureAlgorithm::EcdsaP256Sha256);
    assert_eq!(signer.certificate_pem(), certificate.as_slice());
    // The message is ignored on purpose: the caller signed it already, out of
    // process, and nothing here could check that it did.
    assert_eq!(
        signer
            .sign(b"whatever this crate hands it")
            .expect("answers"),
        signature.to_vec()
    );
}

#[test]
fn completing_an_external_signature_produces_the_bytes_a_local_key_would() {
    // RSA PKCS#1 v1.5 is deterministic, so the two paths are byte-comparable
    // — which is the strongest available statement of "the external route
    // reuses the shipped one" short of a second implementation to diff.
    let pdf = simple_pdf();
    let certificate = keys().read("rsa2048.cert.pem");
    let signature = signature_from_elsewhere(&pdf, "rsa2048", SignatureAlgorithm::RsaPkcs1Sha256);
    let options = PlaceholderOptions::default();

    let external = sign_document(
        &pdf,
        &PresignedSigner::new(SignatureAlgorithm::RsaPkcs1Sha256, &certificate, &signature),
        &options,
    )
    .expect("completing succeeds");

    let local = LocalPemSigner::new(&keys().read("rsa2048.key.pem"), None, &certificate)
        .expect("the local signer loads");
    let locally = sign_document(&pdf, &local, &options).expect("signing succeeds");

    assert_eq!(external, locally);
}

#[test]
fn a_signature_made_over_another_document_still_writes_a_document() {
    // The C ABI's entry points say this in prose: completing with a signature
    // made over a DIFFERENT document is not detected here — it produces a
    // well-formed file that fails verification. A surface whose refusals are
    // its whole value should not leave that claim to a comment.
    let pdf = simple_pdf();
    let other = crate::testkit::build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
            (2, "<</Type/Page/Parent 1 0 R/MediaBox[0 0 200 200]>>"),
            (3, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        3,
    );
    let certificate = keys().read("rsa2048.cert.pem");
    let wrong = signature_from_elsewhere(&other, "rsa2048", SignatureAlgorithm::RsaPkcs1Sha256);

    let signed = sign_document(
        &pdf,
        &PresignedSigner::new(SignatureAlgorithm::RsaPkcs1Sha256, &certificate, &wrong),
        &PlaceholderOptions::default(),
    )
    .expect("writing succeeds — nothing here can tell");

    // Well-formed, and demonstrably not what the right signature produces.
    assert!(signed.starts_with(&pdf));
    let right = signature_from_elsewhere(&pdf, "rsa2048", SignatureAlgorithm::RsaPkcs1Sha256);
    assert_ne!(wrong, right);
}
