//! Build script: the N-API link setup, and only when the shim is built.
//!
//! With the `shim` feature off — which is how every workspace gate builds
//! this crate — the body is empty and `napi-build` is not a dependency at
//! all.

fn main() {
    #[cfg(feature = "shim")]
    napi_build::setup();
}
