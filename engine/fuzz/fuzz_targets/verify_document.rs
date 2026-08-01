//! The whole verifier over arbitrary bytes: parse, locate, decode, judge.
//!
//! The anchors are fixed and generated once per process — an empty set would
//! short-circuit before any parser ran, so a target without them fuzzes
//! nothing. A verdict of "invalid" is a perfectly good outcome here; what is
//! being hunted is a panic, a hang, or an allocation a 30-byte input should
//! not be able to demand.
#![no_main]

use libfuzzer_sys::fuzz_target;
use shojiku_verify::verify_document;

fuzz_target!(|data: &[u8]| {
    let _ = verify_document(data, shojiku_fuzz::anchors());
});
