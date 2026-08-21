//! Near-e2e suite: signing documents this engine really rendered.
//!
//! The fixtures are the committed `examples/*/output.pdf` files — the same
//! bytes `make examples:check` pins — because the shapes a signer meets in
//! practice (compressed streams, link annotations, several pages) are exactly
//! what a synthetic fixture leaves out.
//!
//! Everything here works on BYTES. Decoding a rendered PDF as text first
//! would substitute replacement characters for compressed-stream bytes and
//! silently move every offset under test.

mod common;
mod documents;
mod external;
