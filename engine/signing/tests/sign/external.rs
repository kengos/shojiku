//! The path where the private key never enters this process.

use shojiku_signing::{
    complete_sign, prepare_sign, PlaceholderOptions, PrivateKey, SignatureContainer, SigningError,
};

use crate::common::{assert_does_not_verify, assert_verifies, covered_bytes, example, key_file};

/// Signs a real document's prepared attributes with a key held outside the
/// crate's own signer, and hands both halves back.
///
/// This is the shape every host's external route has: the certificate and the
/// algorithm go in, the bytes to sign come out, and what comes back is a raw
/// signature the host knows nothing about.
fn signed_elsewhere(
    pdf: &[u8],
    stem: &str,
    algorithm: shojiku_signing::SignatureAlgorithm,
) -> (Vec<u8>, Vec<u8>) {
    let prepared = prepare_sign(pdf, &PlaceholderOptions::default()).expect("preparing succeeds");
    let certificate = key_file(&format!("{stem}.cert.pem"));
    let to_be_signed = SignatureContainer::new(&certificate, prepared.digest(), algorithm)
        .expect("the container starts")
        .to_be_signed()
        .expect("the attributes encode");
    let signature = PrivateKey::from_pem(&key_file(&format!("{stem}.key.pem")), None)
        .expect("the key loads")
        .sign(&to_be_signed)
        .expect("the external signer produces a signature");
    (certificate, signature)
}

#[test]
fn a_signature_made_outside_the_crate_completes_a_real_document() {
    // Nothing here constructs a `Signer`. The digest goes out, a signature
    // comes back, and the document is completed with it — the same shape a
    // hardware token or a cloud signing service would take, which is the
    // reason the two-step API exists at all.
    let pdf = example("business/receipt-ja/output.pdf");
    let prepared = prepare_sign(&pdf, &PlaceholderOptions::default()).expect("preparing succeeds");

    let certificate = key_file("rsa2048.cert.pem");
    let container = SignatureContainer::new(
        &certificate,
        prepared.digest(),
        shojiku_signing::SignatureAlgorithm::RsaPkcs1Sha256,
    )
    .expect("the container starts");
    let to_be_signed = container.to_be_signed().expect("the attributes encode");

    // Stand-in for the external signer: a key this crate is handed only to
    // produce the bytes, exactly as a remote service would.
    let elsewhere = PrivateKey::from_pem(&key_file("rsa2048.key.pem"), None)
        .expect("the key loads")
        .sign(&to_be_signed)
        .expect("the external signer produces a signature");

    let signed = complete_sign(prepared, &container.finish(&elsewhere).expect("finishes"))
        .expect("completing succeeds");
    assert_verifies(&signed, "rsa2048");
}

#[test]
fn the_digest_handed_out_is_the_digest_of_what_ends_up_signed() {
    // The seam's load-bearing promise: an external signer is told to sign a
    // digest, and that digest has to describe the finished file, not the
    // half-finished one it was computed from.
    let pdf = example("forms/rirekisho-ja/output.pdf");
    let prepared = prepare_sign(&pdf, &PlaceholderOptions::default()).expect("preparing succeeds");
    let promised = *prepared.digest();
    let signed = complete_sign(prepared, &[0x30, 0x00]).expect("completing succeeds");
    let actual = ring::digest::digest(&ring::digest::SHA256, &covered_bytes(&signed));
    assert_eq!(promised.as_slice(), actual.as_ref());
}

#[test]
fn a_container_that_outgrows_the_window_is_refused_before_anything_is_written() {
    let pdf = example("business/receipt-ja/output.pdf");
    let options = PlaceholderOptions::with_contents_capacity(512).expect("a legal capacity");
    let prepared = prepare_sign(&pdf, &options).expect("preparing succeeds");
    let error =
        complete_sign(prepared, &vec![0u8; 513]).expect_err("an oversized container is refused");
    assert_eq!(
        error,
        SigningError::SignatureTooLarge {
            needed: 513,
            capacity: 512,
        }
    );
}

#[test]
fn an_encrypted_ec_key_signs_a_real_document_that_fully_verifies() {
    // The one algorithm-format combination the other suites cannot reach
    // transitively: an encrypted RSA key proves itself byte-equal to its
    // plaintext twin's verified output, but ECDSA draws a fresh nonce per
    // signature, so an encrypted EC key's output is never byte-comparable to
    // anything — it has to go through the full independent checker itself.
    let pdf = example("business/receipt-ja/output.pdf");
    let signer = shojiku_signing::LocalPemSigner::new(
        &key_file("ec256.enc.pem"),
        Some(&key_file("passphrase.txt")),
        &key_file("ec256.cert.pem"),
    )
    .expect("the encrypted EC key loads");
    let signed = shojiku_signing::sign_document(
        &pdf,
        &signer,
        &shojiku_signing::PlaceholderOptions::default(),
    )
    .expect("signing succeeds");
    assert_verifies(&signed, "ec256");
}

#[test]
fn a_presigned_signer_completes_a_real_document_that_fully_verifies() {
    // The path every HOST takes: prepare, sign elsewhere, hand the raw
    // signature back through `PresignedSigner`. The C ABI and the CLI both
    // reach the document writer this way, so this is the shape under test
    // rather than the hand-built container the first case in this file uses.
    let pdf = example("business/receipt-ja/output.pdf");
    let algorithm = shojiku_signing::SignatureAlgorithm::RsaPkcs1Sha256;
    let (certificate, signature) = signed_elsewhere(&pdf, "rsa2048", algorithm);

    let signed = shojiku_signing::sign_document(
        &pdf,
        &shojiku_signing::PresignedSigner::new(algorithm, &certificate, &signature),
        &PlaceholderOptions::default(),
    )
    .expect("completing succeeds");
    assert_verifies(&signed, "rsa2048");
}

#[test]
fn a_presigned_ec_signature_completes_a_real_document_that_fully_verifies() {
    let pdf = example("forms/rirekisho-ja/output.pdf");
    let algorithm = shojiku_signing::SignatureAlgorithm::EcdsaP256Sha256;
    let (certificate, signature) = signed_elsewhere(&pdf, "ec256", algorithm);

    let signed = shojiku_signing::sign_document(
        &pdf,
        &shojiku_signing::PresignedSigner::new(algorithm, &certificate, &signature),
        &PlaceholderOptions::default(),
    )
    .expect("completing succeeds");
    assert_verifies(&signed, "ec256");
}

#[test]
fn a_signature_made_over_another_document_writes_a_file_that_does_not_verify() {
    // The seam's stated failure mode, made checkable: pairing a prepare of
    // one document with a complete of another is NOT detected while writing —
    // it produces a well-formed document that fails verification. A host
    // cannot catch it either, which is why the claim has to be true.
    let pdf = example("business/receipt-ja/output.pdf");
    let other = example("forms/rirekisho-ja/output.pdf");
    let algorithm = shojiku_signing::SignatureAlgorithm::RsaPkcs1Sha256;
    let (certificate, wrong) = signed_elsewhere(&other, "rsa2048", algorithm);

    let signed = shojiku_signing::sign_document(
        &pdf,
        &shojiku_signing::PresignedSigner::new(algorithm, &certificate, &wrong),
        &PlaceholderOptions::default(),
    )
    .expect("writing succeeds — nothing here can tell");
    assert!(signed.starts_with(&pdf));
    assert_does_not_verify(&signed, "rsa2048");
}
