//! Stack: a document at the YAML door's depth bound, read from a caller
//! thread whose stack is far smaller than that read needs.
//!
//! The host decides how big its threads' stacks are, and an FFI SDK calls in
//! from whichever thread its user is on. So the library cannot assume the
//! caller's stack, and this suite calls it from one too small for the read: a
//! debug build needs about 3 MiB at the bound, a release build about 450 KiB.

use super::*;
use shojiku_core::yaml::MAX_DEPTH;

/// Smaller than either build needs, so the read only fits because the
/// library does not run it on this thread.
const SMALL_CALLER_STACK: usize = 256 << 10;

/// Params nested to the depth bound, as arrays and as objects, validated from
/// a thread of [`SMALL_CALLER_STACK`]. An overflow would abort the whole test
/// binary rather than fail an assertion.
#[test]
fn params_at_the_depth_bound_read_from_a_small_caller_stack() {
    for params in [
        format!("{}1{}", "[".repeat(MAX_DEPTH), "]".repeat(MAX_DEPTH)),
        format!("{}1{}", "{\"a\":".repeat(MAX_DEPTH), "}".repeat(MAX_DEPTH)),
    ] {
        let request = envelope(json!({
            "template": "sections:\n  body:\n    type: flow\n    items: [ { type: text, text: deep } ]\n",
            "params": params,
        }));
        let read = std::thread::Builder::new()
            .stack_size(SMALL_CALLER_STACK)
            .spawn(move || {
                let (status, out) = call(shojiku_validate, &request);
                let read = (status, succeeded(out), diagnostics_of(out));
                // SAFETY: this thread owns the handle it just received, and
                // what the assertions need was copied out of it above.
                unsafe { shojiku_result_free(out) };
                read
            })
            .expect("a small-stack caller thread")
            .join()
            .expect("the caller thread returns");
        assert_eq!(read, (SHOJIKU_OK, true, r#"{"items":[]}"#.to_string()));
    }
}
