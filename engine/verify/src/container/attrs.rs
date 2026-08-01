//! The signed attributes, read back.
//!
//! Two are required and a third is deliberately not looked for. `contentType`
//! must say the signature is over plain data and `messageDigest` carries the
//! digest of the covered bytes — but **a missing `signingTime` is not a
//! defect**. This engine writes none on purpose, so that the same document
//! signed twice with the same RSA key yields the same bytes; a verifier that
//! demanded one would reject every document the signer produces.

use cms::signed_data::SignedAttributes;
use der::asn1::{ObjectIdentifier, OctetString};
use x509_cert::spki::AlgorithmIdentifierOwned;

use crate::error::{Result, VerifyError};

#[cfg(test)]
mod tests;

/// Rejects a digest algorithm this release does not verify.
///
/// RFC 5754 §2 generates SHA-2 identifiers with ABSENT parameters, but
/// producers that write an explicit NULL are common enough — and harmless
/// enough — that both are accepted. Anything else is refused by name.
pub(crate) fn check_digest_algorithm(algorithm: &AlgorithmIdentifierOwned) -> Result<()> {
    if algorithm.oid != shojiku_signing::oid::ID_SHA_256 {
        return Err(VerifyError::Unsupported {
            what: "a digest algorithm other than SHA-256",
        });
    }
    match &algorithm.parameters {
        None => Ok(()),
        Some(parameters) if parameters.is_null() => Ok(()),
        Some(_) => Err(VerifyError::Unsupported {
            what: "digest algorithm parameters other than absent or NULL",
        }),
    }
}

/// Checks that the `contentType` attribute says plain data.
pub(crate) fn check_content_type(attributes: &SignedAttributes) -> Result<()> {
    let value = attribute(attributes, shojiku_signing::oid::ID_CONTENT_TYPE)?;
    let content_type =
        value
            .decode_as::<ObjectIdentifier>()
            .map_err(|_| VerifyError::Malformed {
                what: "a contentType attribute holding an object identifier",
            })?;
    if content_type != shojiku_signing::oid::ID_DATA {
        return Err(VerifyError::Unsupported {
            what: "a signed content type other than plain data",
        });
    }
    Ok(())
}

/// Reads the digest the `messageDigest` attribute carries.
pub(crate) fn message_digest(attributes: &SignedAttributes) -> Result<Vec<u8>> {
    let value = attribute(attributes, shojiku_signing::oid::ID_MESSAGE_DIGEST)?;
    let digest = value
        .decode_as::<OctetString>()
        .map_err(|_| VerifyError::Malformed {
            what: "a messageDigest attribute holding an octet string",
        })?;
    Ok(digest.as_bytes().to_vec())
}

/// The single value of the attribute identified by `oid`.
fn attribute(attributes: &SignedAttributes, oid: ObjectIdentifier) -> Result<der::Any> {
    let found = attributes
        .as_ref()
        .iter()
        .find(|attribute| attribute.oid == oid)
        .ok_or(VerifyError::Malformed {
            what: "a required signed attribute",
        })?;
    match found.values.as_ref() {
        [only] => Ok(only.clone()),
        _ => Err(VerifyError::Malformed {
            what: "a signed attribute carrying exactly one value",
        }),
    }
}
