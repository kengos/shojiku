//! Image bytes from a bundled file or a data URI, classified into an asset
//! under one of four pixel caps and, when accepted as a raster, decoded to
//! RGBA. The checks: an accepted raster has the sniffed format and a
//! non-zero size within the cap, a GIF's first frame covers exactly its
//! logical screen, the decoded image has the header's size and four bytes
//! per pixel, a `Bad` error message is at most 111 characters and has no
//! control character, and the same bytes give the same result twice.
//!
//! The harness is in `shojiku_image::fuzz`, where the corpus replay test
//! runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = shojiku_image::fuzz::raster(data);
});
