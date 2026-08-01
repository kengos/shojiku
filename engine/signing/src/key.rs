//! Loading a private key and producing raw signatures with it.
//!
//! This is the only module that holds key material, and its shape follows from
//! that: the key never leaves the [`PrivateKey`] it is loaded into, the PKCS#8
//! bytes live in a zeroizing document that is dropped before this function
//! returns, and nothing here is `Debug`-printable or logged.
//!
//! A caller that would rather the key never entered this process at all does
//! not have to use this module — [`crate::prepare_sign`] hands out the digest
//! and [`crate::complete_sign`] takes a finished signature back, so an
//! external signer is a first-class path rather than a fallback.

use pkcs8::PrivateKeyInfo;
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, RsaKeyPair, ECDSA_P256_SHA256_ASN1_SIGNING, RSA_PKCS1_SHA256};

use crate::oid;

mod error;
mod pem;
mod size;
#[cfg(test)]
mod tests;

pub use error::KeyError;
pub use size::{MAX_RSA_MODULUS_BITS, MIN_RSA_MODULUS_BITS};

/// Which signature algorithm a loaded key signs with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureAlgorithm {
    /// RSA PKCS#1 v1.5 over SHA-256.
    RsaPkcs1Sha256,
    /// ECDSA on P-256 over SHA-256, signature in ASN.1 DER form.
    EcdsaP256Sha256,
}

/// A private key loaded from PEM, ready to sign.
///
/// Deliberately not `Debug`, `Clone` or serializable: every one of those would
/// be a way for key material to reach somewhere it was not meant to go.
pub enum PrivateKey {
    /// An RSA key within the backend's signing bounds.
    Rsa(Box<RsaKeyPair>),
    /// An ECDSA key on P-256.
    Ecdsa(Box<EcdsaKeyPair>),
}

impl PrivateKey {
    /// Loads a key from PEM, decrypting it when `passphrase` is supplied.
    ///
    /// # Errors
    ///
    /// Returns [`KeyError`] when the file is not a PKCS#8 key this release
    /// reads, when the passphrase is wrong or missing, or when the key's
    /// algorithm or size is outside what the backend signs with. No variant
    /// can carry the key or the passphrase.
    pub fn from_pem(pem: &[u8], passphrase: Option<&[u8]>) -> Result<Self, KeyError> {
        let document = pem::decode_pkcs8(pem, passphrase)?;
        let der = document.as_bytes();
        let info = PrivateKeyInfo::try_from(der).map_err(|_| KeyError::Malformed)?;
        // Compared rather than matched: an `ObjectIdentifier` constant in a
        // match pattern depends on structural-match rules that are not this
        // type's to promise.
        if info.algorithm.oid == oid::RSA_ENCRYPTION {
            size::check_rsa_modulus(info.private_key)?;
            let pair = RsaKeyPair::from_pkcs8(der).map_err(|_| KeyError::Rejected)?;
            return Ok(Self::Rsa(Box::new(pair)));
        }
        if info.algorithm.oid == oid::ID_EC_PUBLIC_KEY {
            let curve = info
                .algorithm
                .parameters_oid()
                .map_err(|_| KeyError::UnsupportedAlgorithm)?;
            if curve != oid::SECP_256_R_1 {
                return Err(KeyError::UnsupportedAlgorithm);
            }
            let rng = SystemRandom::new();
            let pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_ASN1_SIGNING, der, &rng)
                .map_err(|_| KeyError::Rejected)?;
            return Ok(Self::Ecdsa(Box::new(pair)));
        }
        Err(KeyError::UnsupportedAlgorithm)
    }

    /// The algorithm this key signs with.
    #[must_use]
    pub fn algorithm(&self) -> SignatureAlgorithm {
        match self {
            Self::Rsa(_) => SignatureAlgorithm::RsaPkcs1Sha256,
            Self::Ecdsa(_) => SignatureAlgorithm::EcdsaP256Sha256,
        }
    }

    /// Signs `message`, which the backend digests itself.
    ///
    /// The whole message is passed rather than a digest of it because that is
    /// what CMS requires — the signature covers the DER encoding of the signed
    /// attributes, one of which is in turn the document's digest.
    ///
    /// # Errors
    ///
    /// Returns [`KeyError::SignFailed`] if the backend cannot produce a
    /// signature. The error names nothing about the key.
    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, KeyError> {
        let rng = SystemRandom::new();
        match self {
            Self::Rsa(pair) => {
                let mut signature = vec![0u8; pair.public().modulus_len()];
                pair.sign(&RSA_PKCS1_SHA256, &rng, message, &mut signature)
                    .map_err(|_| KeyError::SignFailed)?;
                Ok(signature)
            }
            Self::Ecdsa(pair) => {
                let signature = pair.sign(&rng, message).map_err(|_| KeyError::SignFailed)?;
                Ok(signature.as_ref().to_vec())
            }
        }
    }
}
