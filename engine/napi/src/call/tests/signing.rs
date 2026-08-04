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

#[test]
fn the_two_step_pair_round_trips_a_document_the_addon_never_held_a_key_for() {
    // The first half hands out bytes, the second takes a signature back. This
    // host learns nothing about where the signature came from, which is the
    // point — so the test signs them with a key the addon is never given.
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let algorithm = b"rsa-pkcs1-sha256";

    let prepared = sign_prepare(&pdf, &certificate, algorithm);
    assert_eq!(prepared.status, shojiku_capi::SHOJIKU_OK);
    assert!(prepared.success, "error: {}", prepared.error);

    // The payload crosses UNPARSED — this host has no schema of its own — so
    // the test reads it exactly as the npm package does.
    let payload: serde_json::Value =
        serde_json::from_str(&prepared.json).expect("the payload is JSON");
    let to_be_signed = payload["toBeSigned"].as_str().expect("bytes to sign");
    let signature = shojiku_signing::PrivateKey::from_pem(&key_bytes("rsa2048.key.pem"), None)
        .expect("the key loads")
        .sign(&base64_decode(to_be_signed))
        .expect("the external signer produces a signature");

    let signed = sign_complete(&pdf, &certificate, algorithm, &signature);
    assert!(signed.success, "error: {}", signed.error);
    // Append-only, exactly as the one-shot path is.
    assert_eq!(&signed.pdf[..pdf.len()], &pdf[..]);
}

#[test]
fn an_algorithm_no_release_writes_is_caller_error_on_both_halves() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");

    let prepared = sign_prepare(&pdf, &certificate, b"rsa-pkcs1-sha1");
    assert_ne!(prepared.status, shojiku_capi::SHOJIKU_OK);
    assert!(prepared.error.contains("invalid_request"));

    let completed = sign_complete(&pdf, &certificate, b"rsa-pkcs1-sha1", b"a signature");
    assert_ne!(completed.status, shojiku_capi::SHOJIKU_OK);
    assert!(completed.error.contains("invalid_request"));
}

/// Decodes the payload's base64 without a dependency: the shim's own consumer
/// (the npm package) uses node's `Buffer`, and this crate has no encoder.
fn base64_decode(text: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bits = 0_u32;
    let mut held = 0_u8;
    let mut out = Vec::new();
    for byte in text.bytes().filter(|byte| *byte != b'=') {
        let value = ALPHABET
            .iter()
            .position(|candidate| *candidate == byte)
            .expect("the payload is standard base64") as u32;
        bits = (bits << 6) | value;
        held += 6;
        if held >= 8 {
            held -= 8;
            out.push(u8::try_from((bits >> held) & 0xFF).expect("one byte"));
        }
    }
    out
}
