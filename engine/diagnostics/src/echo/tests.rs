//! Tests for the bounded-echo guard.

use super::*;

#[test]
fn sanitize_strips_every_kind_of_control_character() {
    // Newline forges a second log line, `\u{1b}` opens a terminal escape,
    // `\u{7}` rings the bell, `\t` and `\u{0}` corrupt column alignment and
    // C string handling downstream.
    // Tab counts as a control character too, so it goes with the rest —
    // the guard removes them outright rather than substituting a space.
    let hostile = "a\nb\tc\u{1b}[31md\u{7}e\u{0}f";
    assert_eq!(sanitize(hostile, MAX_ECHO), "abc[31mdef");
    assert!(!sanitize(hostile, MAX_ECHO).chars().any(char::is_control));
}

#[test]
fn sanitize_clips_by_characters_not_bytes() {
    // Three bytes per char: a byte-based clip would cut mid-scalar (or keep
    // a third as many characters as intended).
    let wide = "あ".repeat(300);
    let out = sanitize(&wide, MAX_ECHO);
    assert_eq!(out.chars().count(), MAX_ECHO);
    assert_eq!(out.len(), MAX_ECHO * 3);
}

#[test]
fn sanitize_leaves_a_value_at_the_cap_untouched_and_cuts_one_past_it() {
    let at_cap = "x".repeat(MAX_ECHO);
    assert_eq!(sanitize(&at_cap, MAX_ECHO), at_cap);

    let past_cap = "x".repeat(MAX_ECHO + 1);
    assert_eq!(sanitize(&past_cap, MAX_ECHO).chars().count(), MAX_ECHO);
}

#[test]
fn sanitize_honours_a_smaller_per_site_cap() {
    // The cap is a per-site parameter — a currency code has no business
    // running to 200 characters — while the control-strip is not negotiable.
    assert_eq!(sanitize("USD", 32), "USD");
    assert_eq!(sanitize(&"z".repeat(50), 32).chars().count(), 32);
}

#[test]
fn echo_marks_a_clipped_value_and_leaves_a_short_one_unmarked() {
    let short = Echo::from("sections.body.items[3]");
    assert_eq!(short.as_str(), "sections.body.items[3]");
    assert!(!short.as_str().ends_with('…'));

    let long = Echo::from("k".repeat(MAX_ECHO + 1));
    assert!(long.as_str().ends_with('…'));
    // The marker is the only character past the cap.
    assert_eq!(long.as_str().chars().count(), MAX_ECHO + 1);
}

#[test]
fn echo_at_exactly_the_cap_is_not_marked() {
    // The boundary the `…` marker creates: a value of exactly MAX_ECHO
    // characters was not cut, so claiming it was would be a lie.
    let at_cap = "y".repeat(MAX_ECHO);
    let echo = Echo::from(at_cap.as_str());
    assert_eq!(echo.as_str(), at_cap);
    assert!(!echo.as_str().ends_with('…'));
}

#[test]
fn control_characters_are_stripped_before_the_clip_not_after() {
    // The order matters: a hostile string can pad itself with control
    // characters so that, under a clip-then-strip implementation, an escape
    // sequence sits past the cap and is never examined. Here 300 stripped
    // characters precede the escape, so a correct implementation has already
    // removed it and a wrong one would keep the visible `[31m` payload
    // WITHOUT having filtered the escape byte itself.
    let hostile = format!("{}\u{1b}[31m", "\u{7}".repeat(300));
    let out = sanitize(&hostile, MAX_ECHO);
    assert!(
        !out.chars().any(char::is_control),
        "control survived: {out:?}"
    );
    assert_eq!(out, "[31m");
}

#[test]
fn echo_renders_through_display_and_never_carries_controls() {
    let echo = Echo::from("bad\u{1b}[2Jvalue");
    assert_eq!(echo.to_string(), "bad[2Jvalue");
    assert!(!echo.to_string().chars().any(char::is_control));
}

#[test]
fn echo_is_buildable_from_every_owned_and_borrowed_string_form() {
    let owned = String::from("ja-JP");
    assert_eq!(Echo::from("ja-JP"), Echo::from(owned.clone()));
    assert_eq!(Echo::from(&owned), Echo::from(owned.as_str()));
}

#[test]
fn echo_from_a_path_sanitizes_the_displayed_form() {
    let path = std::path::PathBuf::from("packs/fonts/ev\u{7}il/manifest.yml");
    let echo = Echo::from(path.as_path());
    assert_eq!(echo.as_str(), "packs/fonts/evil/manifest.yml");
}

#[test]
fn echo_reads_as_a_str_so_it_drops_into_code_that_held_a_string() {
    let echo = Echo::from("sections.body.items[3]");
    // Deref: the `str` inherent methods work directly.
    assert!(echo.contains("items"));
    assert_eq!(echo.len(), "sections.body.items[3]".len());
    // PartialEq against both `&str` and `str`.
    assert_eq!(echo, "sections.body.items[3]");
    assert!(echo != "something else");
    assert_eq!(echo, *"sections.body.items[3]");
}

#[test]
fn comparing_an_echo_to_a_string_compares_the_sanitized_form() {
    // The comparison sees what the echo HOLDS, never the raw input — so a
    // hostile value never equals its own unsanitized spelling.
    let echo = Echo::from("id\u{7}x");
    assert_eq!(echo, "idx");
    assert!(echo != "id\u{7}x");
}

#[test]
fn a_hostile_payload_is_bounded_at_the_message_cap_too() {
    // The ordering of the two caps is asserted at compile time in `echo.rs`;
    // this is the behavioural half — a payload no host would ever print in
    // full still comes back bounded.
    let huge = "m".repeat(10_000);
    assert_eq!(sanitize(&huge, MAX_MESSAGE).chars().count(), MAX_MESSAGE);
}

#[test]
fn bidirectional_overrides_are_stripped_because_they_reorder_the_display() {
    // The "Trojan Source" family. These are format characters, not control
    // characters, so `char::is_control` sees none of them — yet an echo
    // carrying one displays in a different ORDER than its bytes, which
    // defeats the reason for quoting the key back at all.
    for bad in [
        '\u{202e}', // rtl override
        '\u{202d}', // ltr override
        '\u{202a}', // ltr embedding
        '\u{2066}', // ltr isolate
        '\u{2069}', // pop directional isolate
        '\u{200f}', // rtl mark
        '\u{200e}', // ltr mark
        '\u{061c}', // arabic letter mark
    ] {
        let hostile = format!("safe{bad}evil");
        assert_eq!(
            sanitize(&hostile, MAX_ECHO),
            "safeevil",
            "U+{:04X} survived the echo guard",
            bad as u32
        );
    }
}

#[test]
fn joiners_survive_because_stripping_them_would_corrupt_real_text() {
    // The deliberate limit on the rule above: ZWJ/ZWNJ are format characters
    // too, but they carry meaning inside legitimate Indic, Arabic and emoji
    // text. A guard that removed them would mangle a real key instead of
    // defusing a hostile one.
    let real = "क\u{200d}ष and \u{200c}zwnj";
    assert_eq!(sanitize(real, MAX_ECHO), real);
}

#[test]
fn the_truncation_marker_counts_by_the_same_rule_the_strip_uses() {
    // If the marker's own predicate drifted from `sanitize`'s, a string
    // padded with stripped characters would be labelled truncated when it
    // was not. 200 real characters plus 300 stripped ones is exactly at the
    // cap, so the marker must be absent.
    let padded = format!("{}{}", "\u{202e}".repeat(300), "a".repeat(MAX_ECHO));
    let out = sanitize_marked(&padded, MAX_ECHO);
    assert_eq!(out, "a".repeat(MAX_ECHO));
    assert!(!out.ends_with('…'));
}

#[test]
fn an_inline_echo_leaves_most_of_the_arg_budget_to_the_prose() {
    // The ratio is asserted at compile time in `echo.rs`; this pins the
    // behaviour it buys — a hostile value composed into a message cannot
    // crowd out the text explaining the failure, because value + marker plus
    // a realistic sentence still fits inside MAX_ECHO.
    let hostile = "z".repeat(10_000);
    let value = Echo::inline(&hostile);
    assert_eq!(value.as_str().chars().count(), MAX_INLINE_ECHO + 1);

    let composed = format!("asset `{value}`: unrecognized image format");
    assert!(
        composed.chars().count() <= MAX_ECHO,
        "a composed message must survive the arg clip intact: {} chars",
        composed.chars().count()
    );
    assert!(composed.ends_with("unrecognized image format"));
}

#[test]
fn an_inline_echo_strips_the_same_characters_as_every_other_echo() {
    // The cap is the only thing that differs between the echo flavours.
    let hostile = "id\u{1b}[2J\u{202e}x";
    assert_eq!(Echo::inline(hostile), "id[2Jx");
}
