//! Shojiku C ABI: the shared library the FFI SDKs (python, ruby, c#, java)
//! load.
//!
//! The FOURTH thin host over [`shojiku_authoring`], beside the CLI, the MCP
//! server and the WASM bindings. It marshals and nothing else — no layout, no
//! formatting, no PDF construction, no capability list of its own. Everything
//! it exposes already exists one crate down, and if a capability is missing
//! here it is missing in the engine.
//!
//! Three rules the whole surface is built from. They are as much the
//! caller's contract as ours, so `include/shojiku.h` states each one again
//! for the C side:
//!
//! * **Nothing is NUL-terminated.** Every string and every buffer crosses as
//!   a pointer plus a length, because PDF bytes contain NUL and a C string
//!   would truncate a document at its first one.
//! * **One kind of allocation crosses, and it has exactly one destructor.**
//!   Every operation writes an opaque [`ShojikuResult`]; the caller frees it
//!   with `shojiku_result_free`, and every accessor pointer borrows from that
//!   handle and dies with it. Nothing else this library returns is owned by
//!   the caller.
//! * **A failure is data, never an unwind.** Every entry point that runs any
//!   code runs it inside `catch_unwind`, so a panic becomes a status code
//!   instead of undefined behaviour crossing the boundary. (The exception is
//!   `shojiku_abi_version`, which returns a constant and has nothing to
//!   shield.) That is also why no profile building this crate may set
//!   `panic = "abort"`: it would turn the shield into an abort and take the
//!   host process down with it.
//!
//! Host-side only. It never joins the WASM build, opens a socket, or is
//! depended on by another crate.

// The first crate in this workspace to write `unsafe`, so the discipline is
// declared rather than assumed: an `unsafe fn` gets no implicit unsafe body,
// and every unsafe block states why it is sound.
#![deny(unsafe_op_in_unsafe_fn)]
#![deny(clippy::undocumented_unsafe_blocks)]

mod api;
mod input;
mod ops;
mod request;
mod result;
mod status;

pub use api::{
    shojiku_abi_version, shojiku_engine_info, shojiku_preview, shojiku_render, shojiku_sign,
    shojiku_sign_complete, shojiku_sign_prepare, shojiku_validate, shojiku_verify,
};
pub use result::{
    shojiku_result_diagnostics_json, shojiku_result_error_json, shojiku_result_free,
    shojiku_result_json, shojiku_result_page_count, shojiku_result_page_png, shojiku_result_pdf,
    shojiku_result_success, ShojikuResult,
};
pub use status::{
    SHOJIKU_ERR_INVALID_REQUEST, SHOJIKU_ERR_INVALID_UTF8, SHOJIKU_ERR_NULL_ARG,
    SHOJIKU_ERR_OUT_OF_RANGE, SHOJIKU_ERR_PANIC, SHOJIKU_ERR_TOO_LARGE, SHOJIKU_OK,
};
