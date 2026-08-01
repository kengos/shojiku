//! The signed attributes, and the exact bytes a signature covers.
//!
//! Two attributes and no more: `contentType` and `messageDigest`. A third —
//! `signingTime` — is what most producers add here, and it is deliberately
//! absent: it would put the wall-clock time into the signature, so the same
//! document signed twice with the same RSA key would stop producing the same
//! bytes. An unauthenticated clock proves nothing anyway; a trustworthy time
//! is a timestamp-authority token, which is a separate, deferred feature.
//!
//! The encoding rule below is the subtle one, and it comes straight from
//! RFC 5652 §5.4: the signature is computed over the attributes encoded with
//! an EXPLICIT `SET OF` tag, NOT over the `[0] IMPLICIT` form they appear in
//! inside `SignerInfo`. Signing the tagged form instead produces a signature
//! that every conformant verifier rejects.

use cms::signed_data::SignedAttributes;
use der::asn1::{ObjectIdentifier, OctetString, SetOfVec};
use der::Encode;
use x509_cert::attr::Attribute;

use super::encode_any;
use super::error::CmsError;
use crate::oid;

/// Builds the two signed attributes covering `digest`.
pub(crate) fn signed_attributes(digest: &[u8]) -> Result<SignedAttributes, CmsError> {
    let content_type = attribute(oid::ID_CONTENT_TYPE, &oid::ID_DATA)?;
    let digest = OctetString::new(digest)?;
    let message_digest = attribute(oid::ID_MESSAGE_DIGEST, &digest)?;
    let both = vec![content_type, message_digest];
    Ok(SetOfVec::try_from(both)?)
}

/// The DER a signature is computed over: the attributes as an explicit
/// `SET OF`, which is not how they are tagged inside `SignerInfo`.
pub(crate) fn to_be_signed(attributes: &SignedAttributes) -> Result<Vec<u8>, CmsError> {
    Ok(attributes.to_der()?)
}

/// Builds one attribute holding a single DER-encodable value.
fn attribute<T: Encode>(oid: ObjectIdentifier, value: &T) -> Result<Attribute, CmsError> {
    let values = super::set_of(encode_any(value)?)?;
    Ok(Attribute { oid, values })
}
