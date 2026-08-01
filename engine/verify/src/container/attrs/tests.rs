//! Unit tests for the signed attributes.

use super::*;
use der::asn1::SetOfVec;
use der::{Any, Decode, Encode};
use x509_cert::attr::Attribute;

/// An `Any` holding one DER-encodable value.
fn any<T: Encode>(value: &T) -> Any {
    Any::from_der(&value.to_der().expect("the fixture encodes")).expect("it is one value")
}

/// One attribute carrying `values`.
fn attribute_of(oid: ObjectIdentifier, values: Vec<Any>) -> Attribute {
    Attribute {
        oid,
        values: SetOfVec::try_from(values).expect("the fixture values are ordered"),
    }
}

/// A signed-attributes set built from `entries`.
fn set(entries: Vec<Attribute>) -> SignedAttributes {
    SetOfVec::try_from(entries).expect("the fixture attributes are ordered")
}

/// The content-type attribute naming `oid`.
fn content_type(oid: ObjectIdentifier) -> Attribute {
    attribute_of(shojiku_signing::oid::ID_CONTENT_TYPE, vec![any(&oid)])
}

/// A digest algorithm identifier.
fn digest(oid: ObjectIdentifier, parameters: Option<Any>) -> AlgorithmIdentifierOwned {
    AlgorithmIdentifierOwned { oid, parameters }
}

#[test]
fn sha256_is_accepted_with_absent_or_null_parameters() {
    // RFC 5754 says ABSENT; producers that write NULL are common enough,
    // and harmless enough, to admit.
    let sha256 = shojiku_signing::oid::ID_SHA_256;
    assert_eq!(check_digest_algorithm(&digest(sha256, None)), Ok(()));
    assert_eq!(
        check_digest_algorithm(&digest(sha256, Some(Any::null()))),
        Ok(())
    );
}

#[test]
fn a_digest_algorithm_other_than_sha256_is_refused_by_name() {
    assert_eq!(
        check_digest_algorithm(&digest(shojiku_signing::oid::ID_DATA, None)).expect_err("fails"),
        VerifyError::Unsupported {
            what: "a digest algorithm other than SHA-256"
        }
    );
}

#[test]
fn digest_parameters_that_are_neither_absent_nor_null_are_refused() {
    let odd = any(&shojiku_signing::oid::ID_DATA);
    assert_eq!(
        check_digest_algorithm(&digest(shojiku_signing::oid::ID_SHA_256, Some(odd)))
            .expect_err("fails"),
        VerifyError::Unsupported {
            what: "digest algorithm parameters other than absent or NULL"
        }
    );
}

#[test]
fn a_content_type_of_plain_data_is_accepted() {
    let attributes = set(vec![content_type(shojiku_signing::oid::ID_DATA)]);
    assert_eq!(check_content_type(&attributes), Ok(()));
}

#[test]
fn a_signed_content_type_other_than_plain_data_is_refused() {
    let attributes = set(vec![content_type(shojiku_signing::oid::ID_SIGNED_DATA)]);
    assert_eq!(
        check_content_type(&attributes).expect_err("fails"),
        VerifyError::Unsupported {
            what: "a signed content type other than plain data"
        }
    );
}

#[test]
fn a_content_type_attribute_that_is_not_an_identifier_is_refused() {
    let attributes = set(vec![attribute_of(
        shojiku_signing::oid::ID_CONTENT_TYPE,
        vec![Any::null()],
    )]);
    assert_eq!(
        check_content_type(&attributes).expect_err("fails"),
        VerifyError::Malformed {
            what: "a contentType attribute holding an object identifier"
        }
    );
}

#[test]
fn a_missing_required_attribute_is_refused() {
    let attributes = set(vec![content_type(shojiku_signing::oid::ID_DATA)]);
    assert_eq!(
        message_digest(&attributes).expect_err("fails"),
        VerifyError::Malformed {
            what: "a required signed attribute"
        }
    );
}

#[test]
fn a_message_digest_attribute_yields_its_octets() {
    let value = OctetString::new([7u8; 32].as_slice()).expect("an octet string");
    let attributes = set(vec![attribute_of(
        shojiku_signing::oid::ID_MESSAGE_DIGEST,
        vec![any(&value)],
    )]);
    assert_eq!(message_digest(&attributes), Ok(vec![7u8; 32]));
}

#[test]
fn a_message_digest_attribute_that_is_not_an_octet_string_is_refused() {
    let attributes = set(vec![attribute_of(
        shojiku_signing::oid::ID_MESSAGE_DIGEST,
        vec![Any::null()],
    )]);
    assert_eq!(
        message_digest(&attributes).expect_err("fails"),
        VerifyError::Malformed {
            what: "a messageDigest attribute holding an octet string"
        }
    );
}

#[test]
fn an_attribute_carrying_more_than_one_value_is_refused() {
    // A set with two values is well-formed ASN.1 and meaningless here: which
    // of them did the signature cover?
    let attributes = set(vec![attribute_of(
        shojiku_signing::oid::ID_CONTENT_TYPE,
        vec![Any::null(), any(&shojiku_signing::oid::ID_DATA)],
    )]);
    assert_eq!(
        check_content_type(&attributes).expect_err("fails"),
        VerifyError::Malformed {
            what: "a signed attribute carrying exactly one value"
        }
    );
}

#[test]
fn an_attribute_carrying_no_value_is_refused() {
    let attributes = set(vec![attribute_of(
        shojiku_signing::oid::ID_CONTENT_TYPE,
        vec![],
    )]);
    assert_eq!(
        check_content_type(&attributes).expect_err("fails"),
        VerifyError::Malformed {
            what: "a signed attribute carrying exactly one value"
        }
    );
}
