//! The fuzz harnesses of the image crate, which the fuzz targets of the
//! `image` group (`make engine:fuzz FUZZ_GROUP=image`) call: raster bytes
//! through the asset classifier and the pixel decoders (`raster`), SVG
//! markup through the subset parser (`svg`), and one params string through
//! the whole asset load with a host policy (`source`). Each fuzz target and
//! its corpus replay test call the same function, so CI runs the
//! assertions the fuzzer does.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

mod raster;
mod source;
mod svg;
mod tree;

pub use raster::{RasterPaths, raster};
pub use source::{SourcePaths, source};
pub use svg::{SvgPaths, SvgRefusal, svg};
