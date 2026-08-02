//! Tests for the pointer-to-slice layer — the hostile-argument surface every
//! entry point funnels through.

use super::*;

#[test]
fn borrows_a_real_buffer() {
    let data = b"receipt";
    // SAFETY: `data` outlives the borrow and describes exactly `len` bytes.
    let Ok(got) = (unsafe { bytes(data.as_ptr(), data.len(), 64, "request") }) else {
        panic!("a valid buffer should borrow");
    };
    assert_eq!(got, b"receipt");
}

#[test]
fn a_null_pointer_is_refused_whatever_the_length_says() {
    for len in [0, 7] {
        // SAFETY: the pointer is null, which is rejected before any read.
        let outcome = unsafe { bytes(std::ptr::null(), len, 64, "request") };
        assert!(
            matches!(outcome, Err(Failure::NullArg("request"))),
            "a null `request` must be refused at length {len}"
        );
    }
}

#[test]
fn a_length_over_the_cap_is_refused_before_the_bytes_are_read() {
    let data = b"x";
    // A length far past the buffer: the cap check must fire first, which is
    // exactly why the cap is tested before the pointer is dereferenced.
    // SAFETY: no read happens — the length is rejected first.
    let outcome = unsafe { bytes(data.as_ptr(), 1_000_000, 64, "pdf") };
    assert!(matches!(
        outcome,
        Err(Failure::TooLarge {
            what: "pdf",
            len: 1_000_000,
            max: 64
        })
    ));
}

#[test]
fn a_zero_length_never_touches_the_pointer() {
    // A dangling-but-non-null pointer: `from_raw_parts` would be undefined
    // behaviour on it, so this passing is the proof that it is not called.
    let dangling = std::ptr::NonNull::<u8>::dangling().as_ptr().cast_const();
    // SAFETY: the length is zero, so no read is performed.
    let Ok(got) = (unsafe { bytes(dangling, 0, 64, "passphrase") }) else {
        panic!("an empty buffer should borrow as an empty slice");
    };
    assert!(got.is_empty());
}

#[test]
fn an_optional_argument_reads_null_as_absent() {
    // SAFETY: the pointer is null, which returns before any read.
    let Ok(got) = (unsafe { opt_bytes(std::ptr::null(), 0, 64, "passphrase") }) else {
        panic!("a null optional argument is absent, not an error");
    };
    assert!(got.is_none());
}

#[test]
fn an_optional_argument_still_obeys_the_cap() {
    let data = b"secret";
    // SAFETY: `data` outlives the borrow.
    let Ok(Some(got)) = (unsafe { opt_bytes(data.as_ptr(), data.len(), 64, "passphrase") }) else {
        panic!("a supplied optional argument should borrow");
    };
    assert_eq!(got, b"secret");

    // SAFETY: the length is rejected before any read.
    let outcome = unsafe { opt_bytes(data.as_ptr(), 999, 64, "passphrase") };
    assert!(matches!(outcome, Err(Failure::TooLarge { .. })));
}

#[test]
fn text_accepts_utf8_and_refuses_anything_else() {
    let Ok(got) = text("領収書".as_bytes(), "request") else {
        panic!("UTF-8 should be accepted");
    };
    assert_eq!(got, "領収書");

    // A lone continuation byte: valid as bytes, not as text.
    assert!(matches!(
        text(&[0x80], "request"),
        Err(Failure::InvalidUtf8("request"))
    ));
}
