//! The object identifiers the signature format is built from.
//!
//! One home for all of them, because an OID is the kind of constant that is
//! easy to write from memory and impossible to eyeball afterwards: every value
//! below was checked against the `const-oid` crate's generated database rather
//! than transcribed, and the name beside each is the one that database gives
//! it.
//!
//! `new_unwrap` is a `const fn`. These are `const` items, so a malformed
//! identifier is a compile error — there is no runtime unwrap here.

use der::asn1::ObjectIdentifier;

/// `id-data` — the content type of the thing being signed (RFC 5652 §4).
pub const ID_DATA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.7.1");

/// `id-signedData` — the CMS content type this crate produces (RFC 5652 §5).
pub const ID_SIGNED_DATA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.7.2");

/// `id-contentType` — the signed attribute naming what was signed.
pub const ID_CONTENT_TYPE: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.3");

/// `id-messageDigest` — the signed attribute carrying the document digest.
pub const ID_MESSAGE_DIGEST: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.4");

/// `id-sha256` — the only digest algorithm this release uses.
pub const ID_SHA_256: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.1");

/// `rsaEncryption` — the RSA key algorithm, and (per RFC 3370 §3.2) the
/// signature algorithm identifier for RSA PKCS#1 v1.5 signatures in CMS.
pub const RSA_ENCRYPTION: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.1");

/// `id-ecPublicKey` — the EC key algorithm.
pub const ID_EC_PUBLIC_KEY: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.10045.2.1");

/// `secp256r1` (also written prime256v1, NIST P-256) — the only curve here.
pub const SECP_256_R_1: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.10045.3.1.7");

/// `ecdsa-with-SHA256` — the signature algorithm identifier for P-256.
pub const ECDSA_WITH_SHA_256: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.10045.4.3.2");

/// `sha256WithRSAEncryption` — the signature algorithm identifier an X.509
/// CERTIFICATE carries for an RSA PKCS#1 v1.5 signature. Deliberately not the
/// same identifier CMS uses for the same algorithm (`rsaEncryption` above):
/// the two contexts spell it differently, and a verifier that reused one for
/// the other rejects every real certificate.
pub const SHA_256_WITH_RSA_ENCRYPTION: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.11");
