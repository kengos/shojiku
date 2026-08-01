//! Checking the signature itself.
//!
//! Two things have to agree, and they are separate claims. The container
//! states a digest for the covered bytes, and that digest must be the digest
//! those bytes actually have; and the signature must check out over the
//! signed attributes with the public key in the signer's certificate. Only
//! the second is cryptography — the first is what ties the cryptography to
//! this particular document, and a verifier that skipped it would accept a
//! valid signature over somebody else's file.
//!
//! **The verification range is wider than the signing range.** The backend
//! signs RSA moduli of 2047–4096 bits but verifies 2048–8192, so this crate
//! can validate documents it could not have produced. That asymmetry is the
//! backend's, not this design's, and it is stated here rather than
//! discovered.

use der::asn1::ObjectIdentifier;
use ring::digest::{digest, SHA256};
use ring::signature::{
    UnparsedPublicKey, VerificationAlgorithm, ECDSA_P256_SHA256_ASN1, RSA_PKCS1_2048_8192_SHA256,
};
use x509_cert::Certificate;

use crate::container::Container;
use crate::error::{Result, VerifyError};
use crate::report::CheckOutcome;

#[cfg(test)]
mod tests;

/// A signature algorithm this release verifies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SignatureAlgorithm {
    /// RSA PKCS#1 v1.5 over SHA-256.
    RsaPkcs1Sha256,
    /// ECDSA on P-256 over SHA-256, signature in ASN.1 DER form.
    EcdsaP256Sha256,
}

impl SignatureAlgorithm {
    /// The algorithm a CMS `SignerInfo` identifier names.
    pub(crate) fn from_oid(oid: ObjectIdentifier) -> Result<Self> {
        // Compared rather than matched: an `ObjectIdentifier` constant in a
        // match pattern depends on structural-match rules that are not this
        // type's to promise.
        if oid == shojiku_signing::oid::RSA_ENCRYPTION {
            return Ok(Self::RsaPkcs1Sha256);
        }
        if oid == shojiku_signing::oid::ECDSA_WITH_SHA_256 {
            return Ok(Self::EcdsaP256Sha256);
        }
        Err(VerifyError::Unsupported {
            what:
                "a signature algorithm other than RSA PKCS#1 v1.5 or ECDSA P-256, both over SHA-256",
        })
    }

    /// The algorithm an X.509 CERTIFICATE's identifier names.
    ///
    /// Not the same table: a certificate spells RSA PKCS#1 v1.5 as
    /// `sha256WithRSAEncryption`, while CMS spells the same algorithm
    /// `rsaEncryption`. Reusing one table for the other rejects every real
    /// certificate.
    pub(crate) fn from_certificate_oid(oid: ObjectIdentifier) -> Result<Self> {
        if oid == shojiku_signing::oid::SHA_256_WITH_RSA_ENCRYPTION {
            return Ok(Self::RsaPkcs1Sha256);
        }
        if oid == shojiku_signing::oid::ECDSA_WITH_SHA_256 {
            return Ok(Self::EcdsaP256Sha256);
        }
        Err(VerifyError::Unsupported {
            what: "a certificate signature algorithm other than sha256WithRSAEncryption or ecdsa-with-SHA256",
        })
    }

    /// The backend algorithm that verifies signatures of this kind.
    fn verifier(self) -> &'static dyn VerificationAlgorithm {
        match self {
            Self::RsaPkcs1Sha256 => &RSA_PKCS1_2048_8192_SHA256,
            Self::EcdsaP256Sha256 => &ECDSA_P256_SHA256_ASN1,
        }
    }
}

/// Checks the container's signature against `covered`.
pub(crate) fn check(container: &Container, covered: &[u8]) -> CheckOutcome {
    let expected = digest(&SHA256, covered);
    if container.message_digest != expected.as_ref() {
        return CheckOutcome::failed(
            "the digest the signature covers is not the digest of the signed bytes",
        );
    }
    match verify_with(
        &container.certificate,
        container.algorithm,
        &container.to_be_signed,
        &container.signature,
    ) {
        Ok(()) => CheckOutcome::Passed,
        Err(reason) => CheckOutcome::failed(reason),
    }
}

/// Verifies `signature` over `message` with `certificate`'s public key.
pub(crate) fn verify_with(
    certificate: &Certificate,
    algorithm: SignatureAlgorithm,
    message: &[u8],
    signature: &[u8],
) -> core::result::Result<(), &'static str> {
    let key = certificate
        .tbs_certificate
        .subject_public_key_info
        .subject_public_key
        .as_bytes()
        .ok_or("the certificate's public key is not a whole number of bytes")?;
    UnparsedPublicKey::new(algorithm.verifier(), key)
        .verify(message, signature)
        .map_err(|_| "the signature does not check out against the certificate's public key")
}
