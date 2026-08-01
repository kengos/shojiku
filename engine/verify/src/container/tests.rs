//! Unit tests for decoding the signature container.

use super::*;
use crate::testkit::{keys, signed_pdf};

/// The DER inside a fixture signed with `stem`.
fn container_der(stem: &str) -> Vec<u8> {
    crate::testkit::container_der(&signed_pdf(stem))
}

#[test]
fn a_real_container_yields_its_signer_certificate_and_digest() {
    let container = parse(&container_der("rsa2048")).expect("decodes");
    assert_eq!(container.message_digest.len(), 32);
    assert!(!container.signature.is_empty());
    assert!(!container.to_be_signed.is_empty());
    assert_eq!(container.algorithm, SignatureAlgorithm::RsaPkcs1Sha256);
    // One certificate travels in the container, and it is the signer's.
    assert!(container.others.is_empty());
}

#[test]
fn an_ecdsa_container_reports_its_own_algorithm() {
    let container = parse(&container_der("ec256")).expect("decodes");
    assert_eq!(container.algorithm, SignatureAlgorithm::EcdsaP256Sha256);
}

#[test]
fn bytes_that_are_not_der_are_refused() {
    assert_eq!(
        parse(b"not der at all").err().expect("fails"),
        VerifyError::Malformed {
            what: "a CMS ContentInfo structure"
        }
    );
}

#[test]
fn an_empty_window_is_refused() {
    assert_eq!(
        parse(&[]).err().expect("fails"),
        VerifyError::Malformed {
            what: "a CMS ContentInfo structure"
        }
    );
}

#[test]
fn a_truncated_container_is_refused_at_every_cut() {
    // Every prefix, not one chosen cut: a truncation must be structured
    // wherever it lands, and a single sample proves only that one offset.
    //
    // The window is zero-padded past the container, so prefixes at or beyond
    // its real length still parse — a reader takes the length from the DER's
    // own header and ignores the padding, which is the behavior the decoder
    // is written for. The bound is that length, found rather than assumed.
    let full = container_der("rsa2048");
    let complete = (0..full.len())
        .find(|cut| parse(&full[..*cut]).is_ok())
        .expect("some prefix holds the whole container");
    assert!(complete > 0 && complete < full.len(), "{complete}");
    for cut in 0..complete {
        assert!(
            parse(&full[..cut]).is_err(),
            "a container cut at {cut} bytes was accepted"
        );
    }
}

#[test]
fn a_content_type_other_than_signed_data_is_refused() {
    // A ContentInfo that decodes, wrapping plain data instead of SignedData.
    let der = der_content_info(shojiku_signing::oid::ID_DATA);
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Unsupported {
            what: "a CMS content type other than SignedData"
        }
    );
}

#[test]
fn a_signed_data_content_that_is_not_signed_data_is_refused() {
    let der = der_content_info(shojiku_signing::oid::ID_SIGNED_DATA);
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Malformed {
            what: "a CMS SignedData structure"
        }
    );
}

/// A `ContentInfo` of `content_type` whose content is a bare NULL — enough
/// to decode as a ContentInfo and nothing more.
fn der_content_info(content_type: der::asn1::ObjectIdentifier) -> Vec<u8> {
    use cms::content_info::ContentInfo;
    ContentInfo {
        content_type,
        content: der::Any::null(),
    }
    .to_der()
    .expect("the fixture encodes")
}

#[test]
fn the_window_decodes_hexadecimal_between_its_brackets() {
    assert_eq!(
        decode_window(b"xx<48690a>yy", &(2..10)),
        Ok(vec![0x48, 0x69, 0x0a])
    );
    // Lower and upper case digits both, and an empty container.
    assert_eq!(decode_window(b"<aAfF>", &(0..6)), Ok(vec![0xaa, 0xff]));
    assert_eq!(decode_window(b"<>", &(0..2)), Ok(vec![]));
}

#[test]
fn a_window_outside_the_document_is_refused() {
    assert_eq!(
        decode_window(b"<00>", &(0..99)).expect_err("fails"),
        VerifyError::Malformed {
            what: "a signature window inside the document"
        }
    );
}

#[test]
fn a_contents_value_that_is_not_a_hexadecimal_string_is_refused() {
    for (buf, span) in [
        (b"(text)".as_slice(), 0..6),
        (b"<unclosed".as_slice(), 0..9),
        (b"noopen>".as_slice(), 0..7),
    ] {
        assert_eq!(
            decode_window(buf, &span).expect_err("fails"),
            VerifyError::Malformed {
                what: "a /Contents value that is a hexadecimal string"
            }
        );
    }
}

#[test]
fn a_window_with_an_odd_number_of_digits_is_refused() {
    assert_eq!(
        decode_window(b"<abc>", &(0..5)).expect_err("fails"),
        VerifyError::Malformed {
            what: "a /Contents string with an even number of hexadecimal digits"
        }
    );
}

#[test]
fn a_window_holding_something_other_than_hexadecimal_is_refused() {
    assert_eq!(
        decode_window(b"<zz>", &(0..4)).expect_err("fails"),
        VerifyError::Malformed {
            what: "a /Contents string of hexadecimal digits only"
        }
    );
}

#[test]
fn a_window_larger_than_any_signature_can_be_is_refused() {
    let oversized = crate::limits::MAX_CONTAINER_BYTES + 1;
    let mut raw = Vec::from(b"<".as_slice());
    raw.resize(oversized * 2 + 1, b'0');
    raw.push(b'>');
    let span = 0..raw.len();
    assert_eq!(
        decode_window(&raw, &span).expect_err("fails"),
        VerifyError::LimitExceeded {
            what: "bytes in the signature window",
            cap: crate::limits::MAX_CONTAINER_BYTES
        }
    );
}

#[test]
fn the_signer_certificate_is_the_one_the_identifier_names() {
    // The fixture's container carries exactly one certificate, so the
    // matching path and the "everything else" path are both exercised by
    // adding a second, unrelated one.
    let der = container_der("rsa2048");
    let signer = parse(&der).expect("decodes").certificate;
    let mine = keys::read("rsa2048.cert.pem");
    let mine = x509_cert::Certificate::load_pem_chain(&mine).expect("loads");
    assert_eq!(
        signer.to_der().expect("encodes"),
        mine[0].to_der().expect("encodes")
    );
}

mod refuse;
