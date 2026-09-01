//! The hostile-input boundary of the reference read surface.
//!
//! Named for what these fixtures actually observe. The stronger property —
//! that no caller string can become a filesystem path — is STRUCTURAL, not
//! observable here: the pages are `include_str!`-embedded and the serving
//! path contains no `std::fs`/`PathBuf` at all. What IS observable is
//! WHERE a hostile string dies: at the grammar (invalid-params), not as a
//! not-found, and never as a read.

use super::*;

#[test]
fn a_hostile_uri_is_refused_as_malformed_not_as_a_miss() {
    for hostile in [
        "shojiku://reference/../../etc/passwd",
        "shojiku://reference/%2e%2e%2f%2e%2e%2fetc/passwd",
        "shojiku://reference/box\0",
        "shojiku://reference/box\u{001b}[2J",
        "shojiku://reference/docs/engine/box",
        "shojiku://reference/box#a#b",
    ] {
        let error = err(hostile);
        assert_eq!(
            error.code, INVALID_PARAMS,
            "{hostile:?} should be refused as malformed"
        );
        assert!(
            error.message.contains("not a Shojiku reference URI"),
            "{hostile:?} produced {}",
            error.message
        );
        assert!(
            error.data.is_none(),
            "a malformed URI is not a resource miss, so it carries no `data`"
        );
    }
}

#[test]
fn a_degenerate_uri_is_refused_without_panicking() {
    for degenerate in [
        "shojiku://reference/",
        "shojiku://reference/#margin",
        "shojiku://reference/box#",
    ] {
        assert_eq!(err(degenerate).code, INVALID_PARAMS, "{degenerate:?}");
    }
}

#[test]
fn a_hostile_uri_echo_is_clipped() {
    // Assert the ECHO itself, not the whole message. The prose and the
    // prefix carry no capital A, so every surviving 'A' is echo — and the
    // budget is spent exactly, so a `clip` regressed to a looser bound
    // fails here rather than passing a slack length check.
    let hostile = format!("shojiku://reference/{}/{}", "A".repeat(600), "b");
    let error = err(&hostile);
    assert_eq!(error.code, INVALID_PARAMS);
    assert_eq!(
        error.message.matches('A').count(),
        shojiku_diagnostics::MAX_ECHO - uri::PREFIX.len(),
        "the echo must spend exactly the MAX_ECHO budget: {}",
        error.message
    );
}

#[test]
fn a_hostile_uri_echo_is_sanitized() {
    // Control characters and the Trojan-Source bidi family never survive
    // into a message a human reads.
    let marker = "UNIQUEMARKER";
    for injected in [
        format!("shojiku://reference/{marker}\u{001b}[2J/x"),
        format!("shojiku://reference/{marker}\u{202e}/x"),
        format!("shojiku://reference/{marker}\u{2069}/x"),
    ] {
        let error = err(&injected);
        assert!(!error.message.contains('\u{001b}'));
        assert!(!error.message.contains('\u{202e}'));
        assert!(!error.message.contains('\u{2069}'));
        // The positive control: the payload DID reach the echo. Without
        // it, a surface that stopped echoing entirely would pass every
        // assertion above.
        assert!(
            error.message.contains(marker),
            "the hostile string never reached the echo: {}",
            error.message
        );
    }
}

#[test]
fn a_hostile_fragment_is_bounded_the_same_way() {
    // Over-long: refused by the grammar's fragment cap, with the echo
    // still bounded by `clip`.
    let long = format!("shojiku://reference/box#{}", "A".repeat(600));
    let error = err(&long);
    assert_eq!(error.code, INVALID_PARAMS);
    assert_eq!(
        error.message.matches('A').count(),
        shojiku_diagnostics::MAX_ECHO - uri::PREFIX.len() - "box#".len()
    );

    // Control and bidi bytes in the FRAGMENT half, with the same positive
    // control as the stem half.
    let marker = "UNIQUEMARKER";
    for injected in [
        format!("shojiku://reference/box#{marker}\u{001b}[2J"),
        format!("shojiku://reference/box#{marker}\u{202e}"),
    ] {
        let error = err(&injected);
        assert_eq!(error.code, INVALID_PARAMS);
        assert!(!error.message.contains('\u{001b}'));
        assert!(!error.message.contains('\u{202e}'));
        assert!(error.message.contains(marker), "{}", error.message);
    }
}

#[test]
fn a_uri_in_neither_family_names_both_of_them() {
    // The dispatcher's fall-through. A client that guessed a scheme gets
    // told what the two real ones are rather than being pushed toward the
    // example family alone.
    let error = err("https://example.com/evil");
    assert_eq!(error.code, INVALID_PARAMS);
    assert!(error.message.contains("shojiku://example/"));
    assert!(error.message.contains("shojiku://reference/"));
}
