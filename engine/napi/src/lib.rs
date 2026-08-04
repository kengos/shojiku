//! Shojiku Node.js addon: the N-API host the `shojiku` npm package loads.
//!
//! The FIFTH thin host over [`shojiku_authoring`], beside the CLI, the MCP
//! server, the WASM bindings and the C ABI library — and the only one that
//! reaches the engine THROUGH another host rather than beside it.
//!
//! That is deliberate. Node has no stdlib FFI, so it cannot load the shared
//! C ABI library the way python, ruby, c# and java do; it needs a native
//! addon. But an addon that re-parsed the request envelope and re-dispatched
//! the operations would be a FORK of that library — two definitions of one
//! wire, drifting apart the first time a key is appended. So this crate links
//! `shojiku-capi` as an rlib and calls its entry points: the envelope crosses
//! unparsed, the status codes are the same integers, and the node SDK maps
//! from the same two-level model as the other four.
//!
//! What is left here is exactly the marshalling node needs and C does not:
//!
//! * **No handle reaches JavaScript.** The C surface lends pointers into a
//!   handle the caller must free; this host reads the handle into an owned
//!   [`Outcome`] and frees it before returning, so the npm package never has
//!   a pointer to lose track of. Node's binding layer is Rust, which is the
//!   whole reason it can be.
//! * **The lifecycle runs off the event loop.** Rendering is CPU work, and
//!   blocking node's single thread for it is not acceptable, so the shim
//!   hands each operation to the libuv threadpool.
//!
//! The shim itself lives behind the non-default `shim` feature, so the
//! workspace test, clippy and coverage gates never compile the N-API glue —
//! the same containment `engine/wasm` gets from `cfg(target_arch = "wasm32")`.
//! `make napi` builds and lints it with the feature on.

mod call;
mod outcome;

#[cfg(feature = "shim")]
pub mod shim;

pub use call::{abi_version, engine_info, render, sign, sign_complete, sign_prepare, verify};
pub use outcome::Outcome;
