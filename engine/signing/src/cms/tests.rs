//! Building the signature container, and reading back what it says.
//!
//! Every test here decodes the finished container again rather than checking
//! that the builder ran. A structure this crate emits and only this crate
//! reads would agree with itself no matter what it got wrong; the point of
//! these is that an outside verifier will find what the format requires.

use cms::content_info::ContentInfo;
use cms::signed_data::{SignedAttributes, SignedData, SignerInfo};
use der::{Decode, Document};

use super::SignatureContainer;
use crate::key::{PrivateKey, SignatureAlgorithm};
use crate::oid;
use crate::testkit::keys::keys;

mod refuse;
mod structure;

/// The digest a real caller passes: 32 bytes out of SHA-256.
const DIGEST: [u8; 32] = [7u8; 32];

/// Builds a container around one of the generated certificates.
fn container(stem: &str, algorithm: SignatureAlgorithm) -> SignatureContainer {
    SignatureContainer::new(&certificate_pem(stem), &DIGEST, algorithm)
        .expect("the container starts")
}

/// The generated certificate for `stem`, as PEM.
fn certificate_pem(stem: &str) -> Vec<u8> {
    keys().read(&format!("{stem}.cert.pem"))
}

/// The generated private key for `stem`.
fn private_key(stem: &str) -> PrivateKey {
    PrivateKey::from_pem(&keys().read(&format!("{stem}.key.pem")), None)
        .expect("the generated key loads")
}

/// Decodes a finished container back into its `SignedData`.
fn decode(der: &[u8]) -> SignedData {
    let info = ContentInfo::from_der(der).expect("a container decodes as content info");
    assert_eq!(info.content_type, oid::ID_SIGNED_DATA);
    info.content
        .decode_as::<SignedData>()
        .expect("the content is signed data")
}

/// The single signer info a container carries.
fn only_signer(signed: &SignedData) -> SignerInfo {
    let signers = signed.signer_infos.0.as_ref();
    assert_eq!(signers.len(), 1, "a container holds exactly one signer");
    signers.first().expect("one signer info").clone()
}

/// The signed attributes of that signer.
fn attributes(signed: &SignedData) -> SignedAttributes {
    only_signer(signed)
        .signed_attrs
        .expect("the signer carries signed attributes")
}

/// Reads a PEM certificate's DER.
fn certificate_der(stem: &str) -> Vec<u8> {
    let pem = certificate_pem(stem);
    let text = core::str::from_utf8(&pem).expect("PEM is text");
    Document::from_pem(text)
        .expect("the certificate decodes")
        .1
        .into_vec()
}
