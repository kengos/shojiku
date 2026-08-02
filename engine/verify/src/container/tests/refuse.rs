//! Container SHAPES this signer never produces, and must still refuse.
//!
//! Each is built by taking a REAL container apart and putting it back
//! together wrong, so every field but the edited one stays exactly as a
//! signer wrote it — a hand-built fixture would prove only that the parser
//! rejects hand-built fixtures.

use super::super::*;
use super::container_der;
use crate::testkit::keys;

/// The container from `stem`, decoded, mutated, and re-encoded.
///
/// Shapes this signer never produces still have to be REFUSED, and the
/// cheapest honest way to build one is to take a real container apart and
/// put it back together wrong — every field but the edited one stays exactly
/// as a real signer wrote it.
fn mutated(stem: &str, edit: impl FnOnce(&mut SignedData)) -> Vec<u8> {
    let der = container_der(stem);
    let mut reader = der::SliceReader::new(&der).expect("the window holds bytes");
    let info = ContentInfo::decode(&mut reader).expect("a container");
    let mut data: SignedData = info.content.decode_as().expect("signed data");
    edit(&mut data);
    ContentInfo {
        content_type: shojiku_signing::oid::ID_SIGNED_DATA,
        content: der::Any::from_der(&data.to_der().expect("re-encodes")).expect("one value"),
    }
    .to_der()
    .expect("the fixture encodes")
}

/// The container's single signer, cloned out.
fn signer_of(data: &SignedData) -> SignerInfo {
    data.signer_infos
        .0
        .as_ref()
        .first()
        .expect("one signer")
        .clone()
}

#[test]
fn an_attached_container_is_refused_by_name() {
    // This release verifies detached signatures: what the signature covers
    // is the PDF's byte ranges, which live outside the container.
    let der = mutated("rsa2048", |data| {
        data.encap_content_info.econtent = Some(der::Any::null());
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Unsupported {
            what: "an attached signature container (this release reads detached signatures)"
        }
    );
}

#[test]
fn a_container_with_no_signer_is_refused() {
    let der = mutated("rsa2048", |data| {
        data.signer_infos = cms::signed_data::SignerInfos(der::asn1::SetOfVec::new());
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Malformed {
            what: "signer information in the container"
        }
    );
}

#[test]
fn a_container_with_more_than_one_signer_is_refused_by_name() {
    let der = mutated("rsa2048", |data| {
        let one = signer_of(data);
        let mut other = one.clone();
        // Distinct, so the set accepts both — which signature would a single
        // verdict be about?
        other.signature = der::asn1::OctetString::new([0u8; 8].as_slice()).expect("bytes");
        data.signer_infos = cms::signed_data::SignerInfos(
            der::asn1::SetOfVec::try_from(vec![one, other]).expect("two distinct signers"),
        );
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Unsupported {
            what: "a container carrying more than one signer"
        }
    );
}

#[test]
fn a_signer_identified_by_key_identifier_is_refused_by_name() {
    let der = mutated("rsa2048", |data| {
        let mut signer = signer_of(data);
        signer.sid =
            SignerIdentifier::SubjectKeyIdentifier(x509_cert::ext::pkix::SubjectKeyIdentifier(
                der::asn1::OctetString::new([1u8; 8].as_slice()).expect("bytes"),
            ));
        data.signer_infos = cms::signed_data::SignerInfos(
            der::asn1::SetOfVec::try_from(vec![signer]).expect("one signer"),
        );
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Unsupported {
            what: "a signer identified by subject key identifier rather than issuer and serial"
        }
    );
}

#[test]
fn a_container_without_signed_attributes_is_refused() {
    let der = mutated("rsa2048", |data| {
        let mut signer = signer_of(data);
        signer.signed_attrs = None;
        data.signer_infos = cms::signed_data::SignerInfos(
            der::asn1::SetOfVec::try_from(vec![signer]).expect("one signer"),
        );
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Malformed {
            what: "signed attributes in the signer information"
        }
    );
}

#[test]
fn a_container_without_certificates_is_refused() {
    let der = mutated("rsa2048", |data| data.certificates = None);
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Malformed {
            what: "a certificate set in the container"
        }
    );
}

#[test]
fn a_container_whose_certificate_does_not_match_the_signer_is_refused() {
    // A certificate set that carries somebody else's certificate: the
    // signature must be checked against the key the container NAMES, never
    // against whichever certificate happens to be first.
    let der = mutated("rsa2048", |data| {
        let stranger = x509_cert::Certificate::load_pem_chain(&keys::read("ec256.cert.pem"))
            .expect("loads")
            .remove(0);
        data.certificates = Some(cms::signed_data::CertificateSet(
            der::asn1::SetOfVec::try_from(vec![CertificateChoices::Certificate(stranger)])
                .expect("one certificate"),
        ));
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Malformed {
            what: "a certificate matching the signer identifier"
        }
    );
}

#[test]
fn more_certificates_than_this_release_reads_are_refused() {
    let der = mutated("rsa2048", |data| {
        let mut held = Vec::new();
        for index in 0..=MAX_CONTAINER_CERTIFICATES {
            let mut copy = match data
                .certificates
                .as_ref()
                .expect("a set")
                .0
                .as_ref()
                .first()
            {
                Some(CertificateChoices::Certificate(certificate)) => certificate.clone(),
                _ => unreachable!("the fixture carries a plain certificate"),
            };
            // Distinct serial numbers, so the set admits every copy.
            copy.tbs_certificate.serial_number =
                x509_cert::serial_number::SerialNumber::new(&[index as u8 + 1]).expect("a serial");
            held.push(CertificateChoices::Certificate(copy));
        }
        data.certificates = Some(cms::signed_data::CertificateSet(
            der::asn1::SetOfVec::try_from(held).expect("distinct certificates"),
        ));
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::LimitExceeded {
            what: "certificates in the signature container",
            cap: MAX_CONTAINER_CERTIFICATES
        }
    );
}

#[test]
fn a_certificate_choice_this_release_does_not_read_is_refused_by_name() {
    // CMS admits formats other than a plain X.509 certificate. Skipping one
    // silently would mean verifying against whatever ELSE the set holds, so
    // the whole container is refused instead.
    let der = mutated("rsa2048", |data| {
        let other = CertificateChoices::Other(cms::cert::OtherCertificateFormat {
            other_cert_format: shojiku_signing::oid::ID_DATA,
            other_cert: der::Any::null(),
        });
        data.certificates = Some(cms::signed_data::CertificateSet(
            der::asn1::SetOfVec::try_from(vec![other]).expect("one entry"),
        ));
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Unsupported {
            what: "a certificate choice other than a plain X.509 certificate"
        }
    );
}

#[test]
fn a_signature_algorithm_this_release_does_not_verify_is_refused_by_name() {
    // The container is otherwise a real one; only the algorithm identifier
    // is swapped. A verifier that fell back to a default here would check
    // the signature with an algorithm the signer never used.
    let der = mutated("rsa2048", |data| {
        let mut signer = signer_of(data);
        signer.signature_algorithm = x509_cert::spki::AlgorithmIdentifierOwned {
            oid: shojiku_signing::oid::ID_SHA_256,
            parameters: None,
        };
        data.signer_infos = cms::signed_data::SignerInfos(
            der::asn1::SetOfVec::try_from(vec![signer]).expect("one signer"),
        );
    });
    assert_eq!(
        parse(&der).err().expect("fails"),
        VerifyError::Unsupported {
            what:
                "a signature algorithm other than RSA PKCS#1 v1.5 or ECDSA P-256, both over SHA-256"
        }
    );
}
