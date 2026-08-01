//! Signing across the boundary: the round trip, the refusals, and the
//! standing promise that key material never comes back out in an error.

use super::*;

#[test]
fn a_rendered_document_signs_and_the_original_bytes_survive_untouched() {
    let pdf = rendered_receipt();
    let (status, out) = sign(
        &pdf,
        &key_bytes("rsa2048.key.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));

    let signed = buffer(shojiku_result_pdf, out);
    // Append-only is the whole trust story: the input must be a byte-for-byte
    // PREFIX of the output, not merely "still a PDF".
    assert!(signed.len() > pdf.len(), "signing appends a revision");
    assert_eq!(&signed[..pdf.len()], &pdf[..], "the original bytes moved");
    // Every operation hands back the same shape, so an SDK reads one field.
    assert_eq!(diagnostics_of(out), "{\"items\":[]}");
    free(out);
}

#[test]
fn an_encrypted_key_signs_when_the_passphrase_is_supplied() {
    let pdf = rendered_receipt();
    let passphrase = std::fs::read(keys().join("passphrase.txt")).expect("the passphrase");
    let (status, out) = sign(
        &pdf,
        &key_bytes("rsa2048.enc.pem"),
        &key_bytes("rsa2048.cert.pem"),
        Some(&passphrase),
    );
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));
    free(out);
}

#[test]
fn an_encrypted_key_with_no_passphrase_says_that_rather_than_failing_to_parse() {
    let pdf = rendered_receipt();
    let (status, out) = sign(
        &pdf,
        &key_bytes("rsa2048.enc.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert_eq!(status, SHOJIKU_OK, "an unusable key is an outcome");
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("passphrase_required"),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn a_wrong_passphrase_and_unusable_key_bytes_both_fail_structurally() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");

    let (status, out) = sign(
        &pdf,
        &key_bytes("rsa2048.enc.pem"),
        &certificate,
        Some(b"not the passphrase"),
    );
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"key\""),
        "{}",
        error_of(out)
    );
    free(out);

    let (status, out) = sign(&pdf, b"-----BEGIN NONSENSE-----", &certificate, None);
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(error_of(out).contains("\"step\":\"sign\""));
    free(out);
}

#[test]
fn signing_something_that_is_not_a_pdf_is_refused_by_the_signer() {
    let (status, out) = sign(
        b"this is not a PDF at all",
        &key_bytes("rsa2048.key.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"signing\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn a_passphrase_over_the_cap_is_refused_before_the_key_is_touched() {
    // The one argument whose cap a null pointer cannot stand in for: a null
    // passphrase means "absent", so the only way to reach its size check is
    // to actually oversize it. Refused as caller misuse — a non-zero status —
    // rather than handed to the key loader.
    let pdf = rendered_receipt();
    let oversized = vec![b'x'; 64 * 1024];
    let (status, out) = sign(
        &pdf,
        &key_bytes("rsa2048.enc.pem"),
        &key_bytes("rsa2048.cert.pem"),
        Some(&oversized),
    );
    assert_eq!(status, SHOJIKU_ERR_TOO_LARGE);
    let error = error_of(out);
    assert!(
        error.contains("too_large") && error.contains("passphrase"),
        "{error}"
    );
    free(out);
}

#[test]
fn no_failure_path_echoes_key_material_or_the_passphrase() {
    // The signing crate builds its errors from static strings and numbers by
    // design, and this boundary clips on top. Both claims are worth pinning
    // HERE, because this is the surface that hands an error to another
    // process's logger.
    let pdf = rendered_receipt();
    let key = key_bytes("rsa2048.enc.pem");
    let certificate = key_bytes("rsa2048.cert.pem");
    let passphrase = b"a distinctive wrong passphrase";

    // A base64 line from the middle of the key: distinctive, and long enough
    // that an accidental match is not credible.
    let secret = String::from_utf8(key.clone())
        .expect("utf8 PEM")
        .lines()
        .find(|line| line.len() > 40 && !line.starts_with("-----"))
        .expect("a key body line")
        .to_string();

    for (label, outcome) in [
        (
            "wrong passphrase",
            sign(&pdf, &key, &certificate, Some(passphrase)),
        ),
        ("no passphrase", sign(&pdf, &key, &certificate, None)),
        (
            "unusable key",
            sign(&pdf, b"-----BEGIN NONSENSE-----", &certificate, None),
        ),
    ] {
        let (_, out) = outcome;
        let error = error_of(out);
        assert!(
            !error.contains(&secret),
            "{label}: the error echoed key material"
        );
        assert!(
            !error.contains("distinctive wrong passphrase"),
            "{label}: the error echoed the passphrase"
        );
        free(out);
    }
}
