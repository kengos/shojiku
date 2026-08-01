//! Concurrency: what several threads calling this library at once get.
//!
//! The header tells a binding that operations may be called concurrently, and
//! every in-process SDK relies on it — an SDK whose client blocked a whole
//! runtime for the length of a render would be unusable in the web
//! applications this product serves. A promise a binding is written against
//! is a promise that ships executed.

use super::*;
use std::sync::Arc;

/// One render, then the same render from four threads at once.
///
/// Two claims in one, and they are different. That every thread SUCCEEDS is
/// the thread-safety half: nothing in the library is shared mutable state, so
/// concurrent calls do not interfere. That every thread produces the same
/// BYTES is the determinism half — the property the whole product rests on
/// does not quietly become "same input, same output, one thread at a time".
///
/// Each thread frees the handle it received. Handles are not shared: one
/// allocation, one owner, one free, exactly as in C.
#[test]
fn renders_the_same_bytes_from_several_threads_at_once() {
    let request = Arc::new(receipt_request());
    let (status, out) = call(shojiku_render, &request);
    assert_eq!(status, SHOJIKU_OK);
    let expected = (
        succeeded(out),
        page_count(out),
        buffer(shojiku_result_pdf, out),
    );
    // SAFETY: this scope owns the handle it just received.
    unsafe { shojiku_result_free(out) };

    let threads: Vec<_> = (0..4)
        .map(|_| {
            let request = Arc::clone(&request);
            std::thread::spawn(move || {
                let (status, out) = call(shojiku_render, &request);
                assert_eq!(status, SHOJIKU_OK);
                let produced = (
                    succeeded(out),
                    page_count(out),
                    buffer(shojiku_result_pdf, out),
                );
                // SAFETY: this thread owns the handle it just received, and
                // the bytes were copied out of it above.
                unsafe { shojiku_result_free(out) };
                produced
            })
        })
        .collect();

    for thread in threads {
        assert_eq!(thread.join().expect("a render thread"), expected);
    }
}
