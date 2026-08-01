//! Failure modes of loading a private key.
//!
//! Every variant is a `&'static str` or a number, for the same structural
//! reason the document errors are ([`crate::error`]) plus a sharper one: the
//! values in flight here are a private key and the passphrase that decrypts
//! it. A variant able to hold a `String` from the input could carry either
//! into a log line, so none exists. Sizes and names locate the problem;
//! nothing quotes the key.

use thiserror::Error;

/// What went wrong while reading a private key.
#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum KeyError {
    /// The bytes are not a PEM file this release reads.
    #[error("the key file is not PEM text containing a private key")]
    NotPem,

    /// A legacy OpenSSL "traditional" PEM key, which needs converting.
    ///
    /// Naming the conversion is the point: a bare "unsupported format" on a
    /// file the caller considers an ordinary key is the pain this project
    /// exists to avoid.
    #[error(
        "this is a legacy OpenSSL private key, which this release does not read; \
         convert it once with `openssl pkcs8 -topk8 -in <key>.pem -out key.pem` \
         (add -nocrypt to write it unencrypted)"
    )]
    LegacyPem,

    /// The PEM label names something other than a PKCS#8 private key.
    #[error(
        "the PEM label is not `PRIVATE KEY` or `ENCRYPTED PRIVATE KEY`, \
         so the file is not a PKCS#8 private key"
    )]
    UnsupportedLabel,

    /// The key is encrypted but no passphrase was supplied.
    #[error("the key is an encrypted PKCS#8 key, so it needs a passphrase")]
    PassphraseRequired,

    /// Decryption failed: a wrong passphrase, or a scheme not supported.
    ///
    /// The two are deliberately one variant. Distinguishing them would tell a
    /// caller which half of the secret was wrong.
    #[error(
        "the encrypted key could not be decrypted: the passphrase is wrong, \
         or its encryption scheme is not supported"
    )]
    PassphraseRejected,

    /// The decoded key is not valid DER for a PKCS#8 private key.
    #[error("the key is not a structurally valid PKCS#8 private key")]
    Malformed,

    /// The key's algorithm is outside this release's set.
    #[error(
        "unsupported key algorithm: this release signs with RSA \
         or with ECDSA on the P-256 curve"
    )]
    UnsupportedAlgorithm,

    /// An RSA modulus below the backend's floor for signing.
    #[error("the RSA key is {bits} bits, below the {min}-bit minimum this backend signs with")]
    RsaModulusTooSmall {
        /// The key's modulus size.
        bits: usize,
        /// The lowest modulus the backend signs with.
        min: usize,
    },

    /// An RSA modulus above the backend's ceiling for signing.
    ///
    /// The ceiling is lower for signing than for verification, so a caller can
    /// hold a key whose documents verify but which cannot produce new ones.
    #[error("the RSA key is {bits} bits, above the {max}-bit maximum this backend signs with")]
    RsaModulusTooLarge {
        /// The key's modulus size.
        bits: usize,
        /// The largest modulus the backend signs with.
        max: usize,
    },

    /// The backend refused the key for a reason our own checks did not catch.
    #[error("the cryptographic backend rejected the key as unusable for signing")]
    Rejected,

    /// Producing the signature failed inside the backend.
    #[error("the cryptographic backend failed to produce a signature")]
    SignFailed,
}
