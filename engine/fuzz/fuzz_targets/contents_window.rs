//! The `/Contents` window decoder: a PDF hexadecimal string back into DER.
//!
//! Reached through a valid document only when the structural walk has
//! already found a signature dictionary, which byte mutation essentially
//! never produces — so the window is fed directly. The input IS the window,
//! brackets included.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = shojiku_verify::fuzz::decode_contents_window(data);
});
