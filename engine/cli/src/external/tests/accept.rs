//! What the pair hands out, and the documents it produces.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;

use super::{prepare_args, round_trip, Silent, EC, RSA};
use crate::external::run_sign_prepare;
use crate::tests::{example_pdf, key_dir};
use crate::ReportArg;

#[test]
fn the_payload_carries_exactly_the_four_keys_the_c_abi_hands_out() {
    // The subprocess SDKs read the SAME object off both hosts; a fifth key or
    // a renamed one here would be a second vocabulary for one wire.
    let prepared = run_sign_prepare(&prepare_args("rsa2048", RSA)).expect("preparing succeeds");
    let value: serde_json::Value = serde_json::to_value(&prepared).expect("the payload serializes");
    let object = value.as_object().expect("an object");
    let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["byteRange", "capacity", "digest", "toBeSigned"]);
}

#[test]
fn what_it_hands_out_to_sign_is_the_signed_attributes_not_the_document_digest() {
    // The distinction the shorthand gets wrong: signing the digest instead
    // produces a document that fails verification.
    let prepared = run_sign_prepare(&prepare_args("rsa2048", RSA)).expect("preparing succeeds");
    let to_be_signed = STANDARD
        .decode(&prepared.to_be_signed)
        .expect("the payload is base64");
    let digest = STANDARD.decode(&prepared.digest).expect("base64");

    assert_eq!(digest.len(), 32);
    assert_ne!(to_be_signed, digest);
    // A DER SET OF attributes (tag 0x31), carrying the digest inside it —
    // the EXPLICIT `SET OF` form RFC 5652 makes the signature cover, not the
    // `[0] IMPLICIT` shape the same attributes have inside `SignerInfo`.
    assert_eq!(to_be_signed[0], 0x31);
    assert!(to_be_signed.windows(32).any(|window| window == digest));
}

#[test]
fn the_reported_ranges_cover_the_document_the_signature_ends_up_in() {
    let prepared = run_sign_prepare(&prepare_args("rsa2048", RSA)).expect("preparing succeeds");
    let [first_at, first_len, second_at, second_len] = prepared.byte_range;

    assert_eq!(first_at, 0);
    assert_eq!(second_at, first_len + 2 * prepared.capacity + 2);
    assert!(second_len > 0);
}

#[test]
fn a_signature_made_elsewhere_completes_the_document_it_was_prepared_from() {
    let original = std::fs::read(example_pdf()).expect("the example is committed");
    let signed = round_trip("rsa2048", RSA);

    // Append-only: the signed bytes begin with the input byte for byte.
    assert_eq!(&signed[..original.len()], original.as_slice());
    assert!(signed.len() > original.len());
}

#[test]
fn an_elliptic_curve_signature_completes_it_too() {
    let signed = round_trip("ec256", EC);
    assert!(signed.starts_with(b"%PDF-"));
}

#[test]
fn neither_verb_writes_the_bytes_a_local_key_would_not() {
    // The two paths produce the same document for the same material, which is
    // what makes the external route additive rather than a second writer.
    let signed = round_trip("rsa2048", RSA);
    let locally = crate::sign::run_sign_with(
        &crate::SignArgs {
            input: example_pdf(),
            key: key_dir().join("rsa2048.key.pem"),
            cert: key_dir().join("rsa2048.cert.pem"),
            output: "-".to_owned(),
            passphrase_env: None,
            report: ReportArg::default(),
        },
        &Silent,
    )
    .expect("signing succeeds");

    assert_eq!(signed, locally);
}
