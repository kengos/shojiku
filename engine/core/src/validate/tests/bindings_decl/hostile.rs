//! Hostile declaration maps: what a diagnostic is allowed to echo back,
//! and that a large / deep / control-char-bearing map degrades to
//! warnings instead of panicking.

use super::*;

#[test]
fn a_very_long_declaration_key_is_clipped_in_the_diagnostic() {
    let long = "k".repeat(300);
    let template = tpl(&format!(
        "      - type: text\n        text: \"{{n}}\"\n        bindings:\n          n: {{ key: {long} }}\n"
    ));
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_data_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    // Params-controlled length never reaches the message verbatim.
    assert!(!found[0].message.contains(&long), "echoed the whole key");
    assert!(found[0].message.len() < 400, "{}", found[0].message.len());
}

#[test]
fn a_control_character_name_is_reported_without_echoing_the_control() {
    let template = tpl(concat!(
        "      - type: text\n",
        "        text: static\n",
        "        bindings:\n",
        "          \"\\u0001evil\": { key: store }\n",
    ));
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "invalid_binding_name");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(
        !found[0].message.chars().any(char::is_control),
        "control characters reached the message"
    );
}

#[test]
fn a_large_deep_declaration_map_degrades_to_warnings() {
    // 300 declarations (past the cap), each pointing at a deeply dotted
    // key that resolves to nothing — every one of them a warning, none of
    // them a panic or an unbounded walk.
    let deep = (0..100)
        .map(|i| format!("s{i}"))
        .collect::<Vec<_>>()
        .join(".");
    let decls: String = (0..300)
        .map(|i| format!("          b{i}: {{ key: {deep} }}\n"))
        .collect();
    let refs: String = (0..300).map(|i| format!("{{b{i}}}")).collect();
    let template = tpl(&format!(
        "      - type: text\n        text: \"{refs}\"\n        bindings:\n{decls}"
    ));
    let params = json!({ "store": "s" });
    let diags = validate(Some(&jdefs()), &template, Some(&params));
    assert_eq!(find(&diags, "too_many_bindings").len(), 1, "{diags:?}");
    // Each declaration's key is reported once; nothing is silently lost.
    assert_eq!(find(&diags, "unknown_data_key").len(), 300, "{diags:?}");
    assert!(find(&diags, "unused_binding").is_empty(), "{diags:?}");
}

#[test]
fn a_hostile_declaration_name_is_bounded_in_the_diagnostic_path_too() {
    // The existing tests above pin the MESSAGE, whose args ride `ArgValue`
    // and are sanitized for free. `Diagnostic::path` has no such guard — it
    // is assigned raw by `with_path` — and this builder interpolates the
    // declared NAME into it, at a site that only fires when the name is
    // invalid. So the path was the unguarded half of the same echo.
    // 300, not 5000: YAML refuses a simple key past 1024 characters, so a
    // longer name is a parse error and never reaches the builder at all.
    // Still well over the 80-char inline cap this test is about.
    let long = "n".repeat(300);
    let template = tpl(&format!(
        "      - type: text\n        text: static\n        bindings:\n          \"\\u0001{long}\": {{ key: store }}\n"
    ));
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "invalid_binding_name");
    assert_eq!(found.len(), 1, "{diags:?}");

    let path = found[0].path.as_deref().expect("a located diagnostic");
    assert!(
        !path.chars().any(char::is_control),
        "a control character reached the diagnostic path: {path:?}"
    );
    assert!(
        path.chars().count() < 200,
        "unbounded diagnostic path ({} chars)",
        path.chars().count()
    );
    // Still located, not blanked — the path must remain useful.
    assert!(
        path.contains(".bindings."),
        "path lost its structure: {path:?}"
    );
}
