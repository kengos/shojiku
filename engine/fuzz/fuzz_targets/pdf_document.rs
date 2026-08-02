//! The document reader: arbitrary bytes through the shared PDF parser.
//!
//! This is the parser BOTH crates read a file with, so a crash here is a
//! crash in the signer and the verifier at once. Parsing is followed by one
//! resolution step, because the cross-reference table's offsets are only
//! dereferenced when an object is actually fetched.
#![no_main]

use libfuzzer_sys::fuzz_target;
use shojiku_signing::PdfDocument;

fuzz_target!(|data: &[u8]| {
    if let Ok(doc) = PdfDocument::parse(data) {
        let _ = doc.dict_at(doc.catalog_number());
    }
});
