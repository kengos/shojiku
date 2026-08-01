//! The CMS `SignedData` container: arbitrary DER through the decoder.
//!
//! The certificates, the signer identifier and the signed attributes are all
//! attacker-chosen in a hostile document, and all of them are parsed before
//! any cryptography runs. Fed directly for the same reason the window is:
//! a mutating fuzzer would never build the document that leads here.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = shojiku_verify::fuzz::decode_container(data);
});
