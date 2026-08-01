//! Reading the CMS `SignedData` out of a signature dictionary.
//!
//! Everything here is decoded from bytes an attacker chose, so the module is
//! written to reject rather than to cope: one signer or none, one recognized
//! digest algorithm, one recognized signature algorithm, a detached
//! container, and a certificate the signer identifier actually names. Each
//! refusal says what was unsupported instead of failing generically.
//!
//! The subtle one is [`Reader::to_be_signed`]. A signature covers the signed
//! attributes encoded with an EXPLICIT `SET OF` tag (RFC 5652 §5.4), not the
//! `[0] IMPLICIT` form they carry inside `SignerInfo`. Re-encoding them the
//! other way produces a hash of the wrong bytes and every signature fails,
//! which is a spectacularly confusing way to be wrong — so the encoding is
//! the same call the signer makes.

use cms::cert::CertificateChoices;
use cms::content_info::ContentInfo;
use cms::signed_data::{SignedData, SignerIdentifier, SignerInfo};
use der::{Decode, Encode, SliceReader};
use x509_cert::Certificate;

use crate::error::{Result, VerifyError};
use crate::limits::MAX_CONTAINER_CERTIFICATES;
use crate::signature::SignatureAlgorithm;

mod attrs;
#[cfg(test)]
mod tests;
pub(crate) mod window;

pub(crate) use window::decode_window;

/// A signature container, decoded down to what verification needs.
pub(crate) struct Container {
    /// The signer's own certificate.
    pub(crate) certificate: Certificate,
    /// Every other certificate the container carried, for chain building.
    pub(crate) others: Vec<Certificate>,
    /// The exact bytes the signature was computed over.
    pub(crate) to_be_signed: Vec<u8>,
    /// The digest the signer claims the covered bytes have.
    pub(crate) message_digest: Vec<u8>,
    /// The signature itself.
    pub(crate) signature: Vec<u8>,
    /// Which algorithm produced it.
    pub(crate) algorithm: SignatureAlgorithm,
}

/// Decodes a container from the DER inside a `/Contents` window.
pub(crate) fn parse(der: &[u8]) -> Result<Container> {
    let signed_data = signed_data(der)?;
    if signed_data.encap_content_info.econtent.is_some() {
        return Err(VerifyError::Unsupported {
            what: "an attached signature container (this release reads detached signatures)",
        });
    }
    let signer = one_signer(&signed_data)?;
    let algorithm = SignatureAlgorithm::from_oid(signer.signature_algorithm.oid)?;
    attrs::check_digest_algorithm(&signer.digest_alg)?;
    let attributes = signer.signed_attrs.as_ref().ok_or(VerifyError::Malformed {
        what: "signed attributes in the signer information",
    })?;
    attrs::check_content_type(attributes)?;
    let (certificate, others) = certificates(&signed_data, &signer.sid)?;
    Ok(Container {
        certificate,
        others,
        // The EXPLICIT `SET OF` encoding — see the module header.
        to_be_signed: attributes.to_der()?,
        message_digest: attrs::message_digest(attributes)?,
        signature: signer.signature.as_bytes().to_vec(),
        algorithm,
    })
}

/// Decodes the outer `ContentInfo` and its `SignedData`.
///
/// The window is zero-padded after the container — every PDF signature is,
/// since a reader takes the length from the DER's own header — so this reads
/// ONE value rather than requiring the whole buffer to be consumed. A strict
/// whole-buffer decode would call the padding trailing garbage.
fn signed_data(der: &[u8]) -> Result<SignedData> {
    let mut reader = SliceReader::new(der)?;
    let info = ContentInfo::decode(&mut reader).map_err(|_| VerifyError::Malformed {
        what: "a CMS ContentInfo structure",
    })?;
    if info.content_type != shojiku_signing::oid::ID_SIGNED_DATA {
        return Err(VerifyError::Unsupported {
            what: "a CMS content type other than SignedData",
        });
    }
    info.content
        .decode_as::<SignedData>()
        .map_err(|_| VerifyError::Malformed {
            what: "a CMS SignedData structure",
        })
}

/// The container's single signer.
fn one_signer(signed_data: &SignedData) -> Result<SignerInfo> {
    let signers = signed_data.signer_infos.0.as_ref();
    match signers {
        [] => Err(VerifyError::Malformed {
            what: "signer information in the container",
        }),
        [only] => Ok(only.clone()),
        _ => Err(VerifyError::Unsupported {
            what: "a container carrying more than one signer",
        }),
    }
}

/// Splits the container's certificates into the signer's own and the rest.
///
/// The signer's certificate is the one its identifier NAMES, not simply the
/// first in the set: a container can carry several, and picking the wrong one
/// would verify a signature against a key its own structure disowns.
fn certificates(
    signed_data: &SignedData,
    sid: &SignerIdentifier,
) -> Result<(Certificate, Vec<Certificate>)> {
    let SignerIdentifier::IssuerAndSerialNumber(wanted) = sid else {
        return Err(VerifyError::Unsupported {
            what: "a signer identified by subject key identifier rather than issuer and serial",
        });
    };
    let held = signed_data
        .certificates
        .as_ref()
        .ok_or(VerifyError::Malformed {
            what: "a certificate set in the container",
        })?;
    let choices = held.0.as_ref();
    if choices.len() > MAX_CONTAINER_CERTIFICATES {
        return Err(VerifyError::LimitExceeded {
            what: "certificates in the signature container",
            cap: MAX_CONTAINER_CERTIFICATES,
        });
    }
    let wanted_key = der_of(&wanted.issuer)?;
    let mut signer: Option<Certificate> = None;
    let mut others = Vec::new();
    for choice in choices {
        let CertificateChoices::Certificate(certificate) = choice else {
            return Err(VerifyError::Unsupported {
                what: "a certificate choice other than a plain X.509 certificate",
            });
        };
        let matches = signer.is_none()
            && certificate.tbs_certificate.serial_number == wanted.serial_number
            && der_of(&certificate.tbs_certificate.issuer)? == wanted_key;
        if matches {
            signer = Some(certificate.clone());
        } else {
            others.push(certificate.clone());
        }
    }
    let signer = signer.ok_or(VerifyError::Malformed {
        what: "a certificate matching the signer identifier",
    })?;
    Ok((signer, others))
}

/// DER of one structure, for comparing two of them.
fn der_of<T: Encode>(value: &T) -> Result<Vec<u8>> {
    Ok(value.to_der()?)
}
