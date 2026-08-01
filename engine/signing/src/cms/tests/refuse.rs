//! What the container refuses, and what it never repeats back.

use der::pem::LineEnding;
use der::Document;

use super::{certificate_pem, DIGEST};
use crate::cms::{CmsError, SignatureContainer};
use crate::key::SignatureAlgorithm;
use crate::testkit::keys::keys;

/// Starts a container around arbitrary certificate bytes.
fn start(certificate: &[u8]) -> Result<SignatureContainer, CmsError> {
    SignatureContainer::new(certificate, &DIGEST, SignatureAlgorithm::RsaPkcs1Sha256)
}

#[test]
fn a_certificate_that_is_not_pem_is_refused() {
    for junk in [b"not a certificate".as_slice(), &[0xff, 0xfe, 0x00]] {
        assert_eq!(
            start(junk).err().expect("junk is refused"),
            CmsError::CertificateNotPem
        );
    }
}

#[test]
fn an_empty_certificate_file_is_refused() {
    assert_eq!(
        start(b"").err().expect("an empty file is refused"),
        CmsError::CertificateNotPem
    );
}

#[test]
fn a_private_key_is_not_a_certificate() {
    // The mistake a caller makes by swapping two command-line arguments. The
    // label is what catches it, before anything tries to parse a key as a
    // certificate.
    assert_eq!(
        start(&keys().read("rsa2048.key.pem"))
            .err()
            .expect("a key is refused where a certificate belongs"),
        CmsError::CertificateNotPem
    );
}

#[test]
fn pem_labelled_a_certificate_but_holding_something_else_is_malformed() {
    let key = keys().read("rsa2048.key.pem");
    let text = core::str::from_utf8(&key).expect("PEM is text");
    let (_, document) = Document::from_pem(text).expect("the key decodes");
    let relabelled = document
        .to_pem("CERTIFICATE", LineEnding::LF)
        .expect("re-encoding as PEM");
    assert_eq!(
        start(relabelled.as_bytes())
            .err()
            .expect("a mislabelled key is refused"),
        CmsError::CertificateMalformed
    );
}

#[test]
fn a_truncated_certificate_is_refused() {
    let pem = certificate_pem("rsa2048");
    let half = pem.len() / 2;
    assert_eq!(
        start(pem.get(..half).expect("a prefix"))
            .err()
            .expect("half a certificate is refused"),
        CmsError::CertificateNotPem
    );
}

#[test]
fn no_container_error_quotes_its_input() {
    let pem = certificate_pem("rsa2048");
    let secret = core::str::from_utf8(&pem)
        .expect("PEM is text")
        .lines()
        .nth(1)
        .expect("a body line")
        .to_owned();
    let errors = [
        CmsError::CertificateNotPem,
        CmsError::CertificateMalformed,
        CmsError::Encoding,
    ];
    for error in errors {
        let message = error.to_string();
        assert!(!message.is_empty());
        assert!(
            !message.contains(&secret),
            "an error quoted its input: {message}"
        );
    }
}

#[test]
fn a_der_failure_becomes_an_encoding_error() {
    // The single conversion every `?` in this module goes through. Tested
    // directly because the encoders it serves only fail on structures no
    // caller can construct — without this, the conversion is never executed
    // by anything, in any test.
    let der = der::Error::from(der::ErrorKind::Failed);
    assert_eq!(CmsError::from(der), CmsError::Encoding);
    assert!(!CmsError::Encoding.to_string().is_empty());
}
