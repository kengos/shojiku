//! Preparing, completing, and signing a document end to end.

use ring::digest::{digest, SHA256};

use super::{complete_sign, hex_pair, prepare_sign, sign_document, PreparedSign};
use crate::cms::SignatureContainer;
use crate::error::SigningError;
use crate::placeholder::PlaceholderOptions;
use crate::signer::{LocalPemSigner, Signer};
use crate::testkit::keys::keys;
use crate::testkit::simple_pdf;

mod roundtrip;

/// Prepares the fixture document with the default window.
fn prepared() -> (Vec<u8>, PreparedSign) {
    let pdf = simple_pdf();
    let prepared = prepare_sign(&pdf, &PlaceholderOptions::default()).expect("preparing succeeds");
    (pdf, prepared)
}

/// A signer over one of the generated key pairs.
fn signer(stem: &str) -> LocalPemSigner {
    LocalPemSigner::new(
        &keys().read(&format!("{stem}.key.pem")),
        None,
        &keys().read(&format!("{stem}.cert.pem")),
    )
    .expect("the signer loads")
}

#[test]
fn the_digest_covers_the_two_declared_ranges_and_nothing_else() {
    // Recomputed here from the byte ranges rather than trusted: this digest
    // is what the signature commits to, so a range the crate reports but does
    // not digest would be a signature over the wrong document.
    let (_, prepared) = prepared();
    let bytes = prepared.prepared.bytes();
    let [first_at, first_len, second_at, second_len] = prepared.byte_range();
    let mut covered = Vec::new();
    covered.extend_from_slice(&bytes[first_at..first_at + first_len]);
    covered.extend_from_slice(&bytes[second_at..second_at + second_len]);
    assert_eq!(
        prepared.digest().as_slice(),
        digest(&SHA256, &covered).as_ref()
    );
}

#[test]
fn the_capacity_is_half_the_reserved_window() {
    // The window holds hexadecimal, so it takes two characters per byte.
    let options = PlaceholderOptions::with_contents_capacity(1024).expect("a legal capacity");
    let prepared = prepare_sign(&simple_pdf(), &options).expect("preparing succeeds");
    assert_eq!(prepared.capacity(), 1024);
}

#[test]
fn a_container_larger_than_the_window_is_refused_with_both_sizes() {
    let (_, prepared) = prepared();
    let capacity = prepared.capacity();
    let oversized = vec![0u8; capacity + 1];
    let error = complete_sign(prepared, &oversized).expect_err("an oversized container is refused");
    assert_eq!(
        error,
        SigningError::SignatureTooLarge {
            needed: capacity + 1,
            capacity,
        }
    );
    let message = error.to_string();
    assert!(message.contains(&capacity.to_string()), "{message}");
}

#[test]
fn a_container_exactly_filling_the_window_is_accepted() {
    // The boundary the check admits, not just the one it rejects.
    let (_, prepared) = prepared();
    let capacity = prepared.capacity();
    assert!(complete_sign(prepared, &vec![0xab; capacity]).is_ok());
}

#[test]
fn completing_changes_only_the_reserved_window() {
    let (_, prepared) = prepared();
    let before = prepared.prepared.bytes().to_vec();
    let window = prepared.prepared.contents_span();
    let after = complete_sign(prepared, b"\x01\x02\x03").expect("completing succeeds");
    assert_eq!(before.len(), after.len(), "the file length must not move");
    for (index, (old, new)) in before.iter().zip(&after).enumerate() {
        if window.contains(&index) {
            continue;
        }
        assert_eq!(old, new, "byte {index} changed outside the window");
    }
}

#[test]
fn the_container_is_written_as_uppercase_hexadecimal_after_the_bracket() {
    let (_, prepared) = prepared();
    let window = prepared.prepared.contents_span();
    let after = complete_sign(prepared, &[0x00, 0xff, 0x9a]).expect("completing succeeds");
    assert_eq!(after[window.start], b'<');
    assert_eq!(&after[window.start + 1..window.start + 7], b"00FF9A");
    // The rest of the window keeps its padding: a reader takes the
    // container's length from its own header and ignores what follows.
    assert_eq!(after[window.start + 7], b'0');
    assert_eq!(after[window.end - 1], b'>');
}

#[test]
fn hex_pairs_cover_both_nibble_halves() {
    assert_eq!(hex_pair(0x00), *b"00");
    assert_eq!(hex_pair(0x0f), *b"0F");
    assert_eq!(hex_pair(0xf0), *b"F0");
    assert_eq!(hex_pair(0xff), *b"FF");
}

#[test]
fn the_original_document_stays_a_byte_identical_prefix() {
    // The whole premise of an incremental update: a signature covers bytes,
    // so none of the ones that were there may move.
    let (pdf, prepared) = prepared();
    let signed = complete_sign(prepared, b"\x30\x00").expect("completing succeeds");
    assert_eq!(&signed[..pdf.len()], pdf.as_slice());
}

#[test]
fn preparing_refuses_a_document_it_cannot_read() {
    let error = prepare_sign(b"not a pdf", &PlaceholderOptions::default())
        .err()
        .expect("junk is refused");
    assert_eq!(error, SigningError::NotAPdf);
}

#[test]
fn signing_refuses_a_document_it_cannot_read() {
    // The one-shot path reports the same structural refusal as the two-step
    // one, rather than failing later with something about keys.
    let error = sign_document(
        b"not a pdf",
        &signer("rsa2048"),
        &PlaceholderOptions::default(),
    )
    .expect_err("junk is refused");
    assert_eq!(error, SigningError::NotAPdf);
}

#[test]
fn signing_reports_a_certificate_problem_through_the_shared_error() {
    let signer = LocalPemSigner::new(&keys().read("rsa2048.key.pem"), None, b"not a certificate")
        .expect("the key still loads");
    let error = sign_document(&simple_pdf(), &signer, &PlaceholderOptions::default())
        .expect_err("a junk certificate is refused");
    assert!(matches!(error, SigningError::Cms(_)), "{error:?}");
}

#[test]
fn a_signature_too_large_for_the_window_is_reported_by_the_one_shot_path() {
    // A 2048-bit RSA container does not fit the smallest window the writer
    // will reserve, and the report says so with both numbers rather than
    // writing a truncated signature.
    let options = PlaceholderOptions::with_contents_capacity(512).expect("a legal capacity");
    let error = sign_document(&simple_pdf(), &signer("rsa2048"), &options)
        .expect_err("a 512-byte window is too small for an RSA container");
    assert!(
        matches!(error, SigningError::SignatureTooLarge { .. }),
        "{error:?}"
    );
}

#[test]
fn the_default_window_holds_the_largest_container_this_release_can_produce() {
    // The reason the default is the size it is. The biggest container comes
    // from the largest modulus the backend will sign with — a 4096-bit
    // signature under a 4096-bit certificate — and if that did not fit, the
    // shipped default would be a trap that only shows up on a real-world
    // certificate. Asserting the headroom too, so a future container that
    // grows has somewhere to go before this becomes a surprise.
    let signed = sign_document(
        &simple_pdf(),
        &signer("rsa4096"),
        &PlaceholderOptions::default(),
    )
    .expect("the default window must hold the largest supported container");
    assert!(!signed.is_empty());

    let prepared =
        prepare_sign(&simple_pdf(), &PlaceholderOptions::default()).expect("preparing succeeds");
    let container = SignatureContainer::new(
        &keys().read("rsa4096.cert.pem"),
        prepared.digest(),
        crate::key::SignatureAlgorithm::RsaPkcs1Sha256,
    )
    .expect("the container starts");
    let key = crate::key::PrivateKey::from_pem(&keys().read("rsa4096.key.pem"), None)
        .expect("the key loads");
    let der = container
        .finish(
            &key.sign(&container_bytes(
                &keys().read("rsa4096.cert.pem"),
                prepared.digest(),
            ))
            .expect("signing succeeds"),
        )
        .expect("the container finishes");
    // Measured at roughly 2.1 kB against a default window of 8 kB, so the
    // margin is not marginal. Asserting half the window rather than all of it
    // keeps that headroom a property rather than an accident: a container
    // that grew past this would fail here, while there is still room to
    // absorb it, instead of failing in a caller's hands.
    assert!(
        der.len() * 2 <= prepared.capacity(),
        "the largest container is {} bytes and the default window holds {}",
        der.len(),
        prepared.capacity()
    );
}

/// The bytes a container over `digest` would have signed.
fn container_bytes(certificate_pem: &[u8], digest: &[u8; 32]) -> Vec<u8> {
    SignatureContainer::new(
        certificate_pem,
        digest,
        crate::key::SignatureAlgorithm::RsaPkcs1Sha256,
    )
    .expect("the container starts")
    .to_be_signed()
    .expect("the attributes encode")
}

#[test]
fn a_container_the_crate_did_not_build_is_written_without_inspection() {
    // `complete_sign` does not parse what it is given, deliberately: an
    // external signer may produce a container this crate has no model of, and
    // second-guessing it here would reject valid work. Junk in produces a
    // well-formed document carrying junk, which fails verification later —
    // the honest outcome, and not a panic.
    let (_, prepared) = prepared();
    let signed = complete_sign(prepared, &[0xde, 0xad, 0xbe, 0xef]).expect("junk is written");
    assert!(signed.windows(8).any(|window| window == b"DEADBEEF"));
}

#[test]
fn an_empty_container_writes_nothing_into_the_window() {
    let (_, prepared) = prepared();
    let window = prepared.prepared.contents_span();
    let signed = complete_sign(prepared, &[]).expect("an empty container is written");
    assert!(signed[window.start + 1..window.end - 1]
        .iter()
        .all(|byte| *byte == b'0'));
}

#[test]
fn the_prepared_document_reports_the_ranges_the_placeholder_computed() {
    let (_, prepared) = prepared();
    let window = prepared.prepared.contents_span();
    let [first_at, first_len, second_at, _] = prepared.byte_range();
    assert_eq!(first_at, 0);
    assert_eq!(first_len, window.start);
    assert_eq!(second_at, window.end);
}

#[test]
fn an_externally_supplied_signature_completes_a_document() {
    // The path that exists so a private key never has to enter this process:
    // nothing below constructs a `Signer`, and the signature is produced
    // outside the crate's own machinery.
    let (_, prepared) = prepared();
    let key = crate::key::PrivateKey::from_pem(&keys().read("ec256.key.pem"), None)
        .expect("the key loads");
    let container = SignatureContainer::new(
        &keys().read("ec256.cert.pem"),
        prepared.digest(),
        key.algorithm(),
    )
    .expect("the container starts");
    let elsewhere = key
        .sign(&container.to_be_signed().expect("the attributes encode"))
        .expect("signing happens outside this crate's control");
    let der = container
        .finish(&elsewhere)
        .expect("the container finishes");
    let signed = complete_sign(prepared, &der).expect("completing succeeds");
    assert!(signed.len() > der.len());
}

#[test]
fn a_signer_reports_the_certificate_it_was_given() {
    let signer = signer("rsa2048");
    assert_eq!(
        signer.certificate_pem(),
        keys().read("rsa2048.cert.pem").as_slice()
    );
    assert!(signer.sign(b"a message").is_ok());
}
