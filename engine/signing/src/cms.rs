//! Assembling the CMS `SignedData` that a PDF signature dictionary carries.
//!
//! The container is built field by field rather than through the `cms` crate's
//! builder, and that is a compatibility decision, not a preference: the
//! builder signs through the RustCrypto `signature::Signer` trait, which the
//! backend used here does not implement. Constructing the structures directly
//! keeps one cryptographic backend instead of two.
//!
//! Building it is split in two so a private key is genuinely optional. A
//! caller takes [`SignatureContainer::to_be_signed`], signs those bytes
//! wherever the key actually lives — a smartcard, a cloud service, another
//! process — and hands the result to [`SignatureContainer::finish`]. The
//! in-process signer is one caller of that seam, not a privileged path.
//!
//! The container is DETACHED: `eContent` is absent, because what the signature
//! covers is the PDF's byte ranges, which live outside this structure.

use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::{CmsVersion, ContentInfo};
use cms::signed_data::{
    EncapsulatedContentInfo, SignedAttributes, SignedData, SignerIdentifier, SignerInfo,
};
use der::asn1::{OctetString, SetOfVec};
use der::{Any, Decode, Encode};
use x509_cert::spki::AlgorithmIdentifierOwned;
use x509_cert::Certificate;

use crate::key::SignatureAlgorithm;
use crate::oid;

mod attrs;
mod error;
#[cfg(test)]
mod tests;

pub use error::CmsError;

/// A signature container part-way through construction: everything except the
/// signature itself.
pub struct SignatureContainer {
    certificate: Certificate,
    attributes: SignedAttributes,
    algorithm: SignatureAlgorithm,
}

impl SignatureContainer {
    /// Starts a container for `digest`, signed by the key `certificate_pem`
    /// belongs to.
    ///
    /// # Errors
    ///
    /// Returns [`CmsError`] when the certificate is not PEM holding an X.509
    /// certificate, or when the attributes cannot be encoded.
    pub fn new(
        certificate_pem: &[u8],
        digest: &[u8],
        algorithm: SignatureAlgorithm,
    ) -> Result<Self, CmsError> {
        let certificate = parse_certificate(certificate_pem)?;
        let attributes = attrs::signed_attributes(digest)?;
        Ok(Self {
            certificate,
            attributes,
            algorithm,
        })
    }

    /// The bytes the signature must be computed over.
    ///
    /// # Errors
    ///
    /// Returns [`CmsError::Encoding`] if the attributes cannot be encoded.
    pub fn to_be_signed(&self) -> Result<Vec<u8>, CmsError> {
        attrs::to_be_signed(&self.attributes)
    }

    /// Completes the container with a signature over [`Self::to_be_signed`],
    /// yielding the DER a PDF signature dictionary holds.
    ///
    /// The signature is not verified here — a container built around a wrong
    /// signature is a well-formed container that fails verification, which is
    /// the honest outcome.
    ///
    /// # Errors
    ///
    /// Returns [`CmsError`] when the certificate's issuer or serial cannot be
    /// re-encoded, or when the container cannot be encoded.
    pub fn finish(self, signature: &[u8]) -> Result<Vec<u8>, CmsError> {
        let digest_algorithm = AlgorithmIdentifierOwned {
            // RFC 5754 §2: SHA-2 algorithm identifiers are generated with
            // ABSENT parameters, not with NULL.
            oid: oid::ID_SHA_256,
            parameters: None,
        };
        let signer = SignerInfo {
            version: CmsVersion::V1,
            sid: SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber {
                issuer: self.certificate.tbs_certificate.issuer.clone(),
                serial_number: self.certificate.tbs_certificate.serial_number.clone(),
            }),
            digest_alg: digest_algorithm.clone(),
            signed_attrs: Some(self.attributes),
            signature_algorithm: signature_algorithm(self.algorithm),
            signature: OctetString::new(signature)?,
            unsigned_attrs: None,
        };
        let held = CertificateChoices::Certificate(self.certificate);
        let certificates = set_of(held)?;
        let signed_data = SignedData {
            version: CmsVersion::V1,
            digest_algorithms: set_of(digest_algorithm)?,
            encap_content_info: EncapsulatedContentInfo {
                econtent_type: oid::ID_DATA,
                econtent: None,
            },
            certificates: Some(certificates.into()),
            crls: None,
            signer_infos: set_of(signer)?.into(),
        };
        let content_info = ContentInfo {
            content_type: oid::ID_SIGNED_DATA,
            content: encode_any(&signed_data)?,
        };
        Ok(content_info.to_der()?)
    }
}

/// The signature algorithm identifier for a key's algorithm.
fn signature_algorithm(algorithm: SignatureAlgorithm) -> AlgorithmIdentifierOwned {
    match algorithm {
        // RFC 3370 §3.2: rsaEncryption with NULL parameters.
        SignatureAlgorithm::RsaPkcs1Sha256 => AlgorithmIdentifierOwned {
            oid: oid::RSA_ENCRYPTION,
            parameters: Some(Any::null()),
        },
        // RFC 5758 §3.2: the parameters MUST be absent.
        SignatureAlgorithm::EcdsaP256Sha256 => AlgorithmIdentifierOwned {
            oid: oid::ECDSA_WITH_SHA_256,
            parameters: None,
        },
    }
}

/// Wraps a single value in the `SET OF` the container expects.
pub(crate) fn set_of<T: der::DerOrd>(value: T) -> Result<SetOfVec<T>, CmsError> {
    Ok(SetOfVec::try_from(vec![value])?)
}

/// Encodes a value as an `ANY`.
///
/// Round-tripped through DER rather than converted directly: an `ANY` holds a
/// whole tag-length-value production, and the direct constructor only accepts
/// types that are already a `SEQUENCE`.
pub(crate) fn encode_any<T: Encode>(value: &T) -> Result<Any, CmsError> {
    Ok(Any::from_der(&value.to_der()?)?)
}

/// Decodes a PEM certificate.
fn parse_certificate(pem: &[u8]) -> Result<Certificate, CmsError> {
    let text = core::str::from_utf8(pem).map_err(|_| CmsError::CertificateNotPem)?;
    let (label, document) =
        der::Document::from_pem(text).map_err(|_| CmsError::CertificateNotPem)?;
    if label != "CERTIFICATE" {
        return Err(CmsError::CertificateNotPem);
    }
    Certificate::from_der(document.as_bytes()).map_err(|_| CmsError::CertificateMalformed)
}
