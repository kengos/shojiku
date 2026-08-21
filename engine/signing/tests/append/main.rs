//! Near-e2e suite: the public API over documents this engine really rendered.
//!
//! The fixtures are the committed `examples/*/output.pdf` files — the same
//! bytes `make examples:check` pins — so the suite exercises the shapes the
//! writer will actually meet rather than a synthetic approximation of them.

mod bundled;
mod common;
mod hostile;
mod reject;
