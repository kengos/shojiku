//! Signing across the boundary — the round trip, and the standing promise
//! that key material never comes back out in a failure.

use super::*;

#[test]
fn a_rendered_document_signs_and_the_original_bytes_survive_untouched() {
    let pdf = rendered_receipt();
    let outcome = sign(
        &pdf,
        &key_bytes("rsa2048.key.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(outcome.success, "error: {}", outcome.error);
    // Append-only is the whole trust story: the input must be a byte-for-byte
    // PREFIX of the output, not merely "still a PDF".
    assert!(outcome.pdf.len() > pdf.len());
    assert_eq!(&outcome.pdf[..pdf.len()], &pdf[..]);
    // Every operation hands back the same shape, so the SDK reads one field.
    assert_eq!(outcome.diagnostics, "{\"items\":[]}");
}

#[test]
fn an_encrypted_key_signs_when_the_passphrase_crosses_with_it() {
    let passphrase = std::fs::read(keys().join("passphrase.txt")).expect("the passphrase");
    let outcome = sign(
        &rendered_receipt(),
        &key_bytes("rsa2048.enc.pem"),
        &key_bytes("rsa2048.cert.pem"),
        Some(&passphrase),
    );
    assert!(outcome.success, "error: {}", outcome.error);
}

#[test]
fn an_unusable_key_is_a_failed_outcome_that_echoes_neither_key_nor_passphrase() {
    let key = key_bytes("rsa2048.enc.pem");
    let passphrase = b"not-the-passphrase";
    let outcome = sign(
        &rendered_receipt(),
        &key,
        &key_bytes("rsa2048.cert.pem"),
        Some(passphrase),
    );
    // A key that will not load is a fact about the material, not caller
    // misuse: status stays OK and the verdict rides on `success`.
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(!outcome.success);
    assert!(outcome.error.contains("\"step\":\"sign\""));

    // The failure reaches a log aggregator and an exception reporter. Neither
    // may learn the key or the passphrase from it.
    let key_body = String::from_utf8_lossy(&key)
        .lines()
        .nth(1)
        .expect("a key body line")
        .to_string();
    assert!(!outcome.error.contains(&key_body));
    assert!(!outcome.error.contains("not-the-passphrase"));
}

#[test]
fn an_encrypted_key_with_no_passphrase_says_so_rather_than_failing_to_parse() {
    let outcome = sign(
        &rendered_receipt(),
        &key_bytes("rsa2048.enc.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert!(!outcome.success);
    assert!(outcome.error.contains("passphrase_required"));
}
