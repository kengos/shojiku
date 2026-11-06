//! A font face's `url:` and the `Location` of every redirect hop. The
//! property under test: no request reaches the transport for a URL that is
//! not https, carries userinfo, names an IP literal, or names a host outside
//! the default allowlist, however the URL and the hops are spelled.
//!
//! The harness (a scripted transport that asserts that URL rule on every
//! request) lives in `shojiku_fetch::fuzz`, where the corpus replay test
//! runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_fetch::fuzz::redirect_chain(text);
    }
});
