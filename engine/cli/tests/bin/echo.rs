//! What a hostile document can get printed on someone's terminal.
//!
//! The behavioural half of the bounded-echo decision, mirroring the suite the
//! sign/verify surface already carries. There, every error is built from
//! `&'static str` and numbers, so the check is that a planted marker never
//! comes back at all. Here it cannot be: an authoring error's whole job is to
//! quote the key the author mistyped. So the check is the other two
//! properties — the echo is BOUNDED, and it carries no control characters.
//!
//! The length bound is the lesser risk. A message that grows is a nuisance;
//! a message that replays an escape sequence is an injection channel into
//! whatever terminal, log or reporter reads it.

use super::{locale_dir, path_arg, shojiku, temp_path};

/// Longest line this surface may print. `MAX_MESSAGE` (400) bounds the
/// engine error; the `shojiku: ` prefix and any wrapping prose are why this
/// is stated with headroom rather than as an exact equality.
const MAX_LINE: usize = 512;

/// A byte run that appears nowhere else in this repository, so finding it in
/// output can only mean the input was echoed back.
const MARKER: &str = "SHOJIKU-HOSTILE-MARKER-4b7e2d";

/// An escape sequence that clears the screen and moves the cursor, plus a
/// bell — written as YAML ESCAPES, not as raw bytes.
///
/// This distinction is the whole point. Both parsers REJECT a raw control
/// byte in their source text, so a document carrying one never reaches the
/// echo at all; it fails with "control characters are not allowed". The
/// reachable attack is a perfectly well-formed document whose DECODED string
/// value contains the escape — which is what these produce.
const ESCAPES_YAML: &str = r"\e[2J\e[H\a";

/// A raw ESC, for the CLI-ARGUMENT vectors (an argv value is not parsed by
/// YAML or JSON, so it can carry the byte directly).
const ESC: char = '\u{1b}';

fn write_temp(name: &str, content: &str) -> String {
    let path = temp_path(name);
    std::fs::write(&path, content).expect("write fixture");
    path_arg(path)
}

fn examples() -> (String, String) {
    (
        path_arg(super::examples_dir().join("templates.yml")),
        path_arg(super::examples_dir().join("params.json")),
    )
}

/// The vectors that actually REACH an echo, and why these and not others.
///
/// Measured, not assumed: a serde YAML/JSON *syntax* error reports positions
/// ("could not find expected \':\' at line 2 column 5043") and never quotes the
/// offending text, so the direct `Parse`/`Json` variants carry no attacker
/// content on that path. What does get quoted is an unknown/mistyped KEY (the
/// located path — quoting it is the point) and the host-supplied ids and paths
/// that name packs. Those are the runs below.
///
/// A further measured limit shapes the key fixture: YAML refuses a simple key
/// past 1024 characters, so an attacker cannot use key length alone — 300 is
/// comfortably over MAX_ECHO (200) and under that ceiling.
fn hostile_runs() -> Vec<(&'static str, Vec<String>)> {
    let (good_template, good_params) = examples();

    let unknown_key = write_temp(
        "echo-unknown-key.yml",
        &format!(
            "version: 1\n\"{ESCAPES_YAML}{MARKER}{}\": 1\n",
            "k".repeat(300)
        ),
    );

    vec![
        (
            "hostile unknown template key",
            vec![
                "validate".into(),
                "--templates".into(),
                unknown_key,
                "--params".into(),
                good_params.clone(),
            ],
        ),
        (
            "hostile locale id",
            vec![
                "render".into(),
                "--templates".into(),
                good_template.clone(),
                "--params".into(),
                good_params.clone(),
                "--lang".into(),
                format!("{ESC}[2J{MARKER}{}", "l".repeat(5_000)),
                "--locale-dir".into(),
                path_arg(locale_dir()),
                "--output".into(),
                "-".into(),
            ],
        ),
        (
            "hostile locale dir path",
            vec![
                "render".into(),
                "--templates".into(),
                good_template,
                "--params".into(),
                good_params,
                "--lang".into(),
                "qq-QQ".into(),
                "--locale-dir".into(),
                format!("/nonexistent/{ESC}[2J{MARKER}{}", "d".repeat(5_000)),
                "--output".into(),
                "-".into(),
            ],
        ),
    ]
}

#[test]
fn no_hostile_document_can_put_a_control_character_on_stderr() {
    for (what, args) in hostile_runs() {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = shojiku(&refs);
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(
            !stderr.chars().any(|c| c.is_control() && c != '\n'),
            "{what}: an escape sequence reached stderr: {stderr:?}"
        );
    }
}

#[test]
fn no_hostile_document_can_make_stderr_grow_without_bound() {
    for (what, args) in hostile_runs() {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = shojiku(&refs);
        let stderr = String::from_utf8_lossy(&out.stderr);
        for line in stderr.lines() {
            assert!(
                line.chars().count() <= MAX_LINE,
                "{what}: an unbounded line reached stderr ({} chars): {:?}",
                line.chars().count(),
                line.chars().take(120).collect::<String>()
            );
        }
    }
}

#[test]
fn the_marker_is_reachable_at_all_so_these_tests_are_not_vacuous() {
    // The positive control. Every assertion above passes trivially if the
    // runs never actually fail or never echo anything, so prove that at
    // least one of them DOES quote the document back — bounded and
    // sanitized, but present. Without this, a change that stopped echoing
    // entirely would look identical to a change that fixed the bound.
    let mut seen = Vec::new();
    let echoed = hostile_runs().into_iter().any(|(what, args)| {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = shojiku(&refs);
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let hit = !out.status.success() && stderr.contains(MARKER);
        seen.push(format!("{what} (ok={}): {stderr:?}", out.status.success()));
        hit
    });
    assert!(
        echoed,
        "no run echoed the planted marker — the bound tests above prove nothing.\n{}",
        seen.join("\n")
    );
}
