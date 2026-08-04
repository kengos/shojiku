//! What it takes to be a signer, and the one this release ships.
//!
//! The trait is deliberately small — an algorithm, a certificate, and a
//! function from bytes to a signature — because everything a signer might
//! otherwise want to know (which document, which byte ranges, how the
//! container is shaped) is the caller's business, not the key holder's. That
//! is what lets a cloud service or a smartcard implement it host-side without
//! this crate learning anything about them.
//!
//! [`LocalPemSigner`] is in-crate rather than behind a plugin boundary
//! because a key on the local disk is the case with no moving parts; anything
//! that needs the network is host-side by the project's network rule and
//! reaches the same place through the trait.

use crate::key::{KeyError, PrivateKey, SignatureAlgorithm};

#[cfg(test)]
mod tests;

/// Something that can produce a signature for this crate's containers.
pub trait Signer {
    /// The algorithm the signatures are produced with.
    fn algorithm(&self) -> SignatureAlgorithm;

    /// The signer's certificate, as PEM.
    fn certificate_pem(&self) -> &[u8];

    /// Signs `message`, returning the raw signature bytes.
    ///
    /// # Errors
    ///
    /// Returns [`KeyError`] when the signature cannot be produced.
    fn sign(&self, message: &[u8]) -> Result<Vec<u8>, KeyError>;
}

/// A signer holding a PEM private key and certificate in this process.
pub struct LocalPemSigner {
    key: PrivateKey,
    certificate: Vec<u8>,
}

impl LocalPemSigner {
    /// Loads a key and its certificate.
    ///
    /// `passphrase` is required exactly when the key is an encrypted PKCS#8
    /// key. It is taken as bytes rather than a string because where it came
    /// from — a prompt, an environment variable, a secret store — is the
    /// host's decision, and this crate should not encourage any particular
    /// one by making it convenient.
    ///
    /// # Errors
    ///
    /// Returns [`KeyError`] when the key cannot be read, decrypted, or used
    /// for signing.
    pub fn new(
        key_pem: &[u8],
        passphrase: Option<&[u8]>,
        certificate_pem: &[u8],
    ) -> Result<Self, KeyError> {
        Ok(Self {
            key: PrivateKey::from_pem(key_pem, passphrase)?,
            certificate: certificate_pem.to_vec(),
        })
    }
}

impl Signer for LocalPemSigner {
    fn algorithm(&self) -> SignatureAlgorithm {
        self.key.algorithm()
    }

    fn certificate_pem(&self) -> &[u8] {
        &self.certificate
    }

    fn sign(&self, message: &[u8]) -> Result<Vec<u8>, KeyError> {
        self.key.sign(message)
    }
}

/// A signer that has ALREADY signed: it answers with bytes the caller brought
/// back from wherever the key lives.
///
/// This is the finishing half of the external flow, and it exists so that
/// half stays the SAME code path as a local key's. A host completing an
/// external signature calls [`crate::sign_document`] with one of these, so
/// the container, the algorithm identifier, the reserved window and its size
/// check are all the shipped ones — there is no second writer that could
/// drift from the first.
///
/// It is not a way to bypass anything. The signature it carries either covers
/// this document's signed attributes or it does not, and a signature made
/// over a DIFFERENT document produces a well-formed file that fails
/// verification — which is stated on the C ABI's own entry points and pinned
/// by a test here.
pub struct PresignedSigner<'a> {
    algorithm: SignatureAlgorithm,
    certificate: &'a [u8],
    signature: &'a [u8],
}

impl<'a> PresignedSigner<'a> {
    /// Wraps a finished signature.
    ///
    /// Borrows rather than copies: every host already holds these bytes for
    /// the length of the call, and a signature is not material that benefits
    /// from another copy in memory.
    #[must_use]
    pub fn new(algorithm: SignatureAlgorithm, certificate: &'a [u8], signature: &'a [u8]) -> Self {
        Self {
            algorithm,
            certificate,
            signature,
        }
    }
}

impl Signer for PresignedSigner<'_> {
    fn algorithm(&self) -> SignatureAlgorithm {
        self.algorithm
    }

    fn certificate_pem(&self) -> &[u8] {
        self.certificate
    }

    /// Answers with the signature it was built from.
    ///
    /// The message is ignored deliberately: the caller signed it already, out
    /// of process. Checking here that the bytes match what was prepared is
    /// not possible — that is precisely what only the key holder could do.
    fn sign(&self, _message: &[u8]) -> Result<Vec<u8>, KeyError> {
        Ok(self.signature.to_vec())
    }
}
