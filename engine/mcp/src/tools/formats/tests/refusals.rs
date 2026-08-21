//! What a hostile or mistaken client reaches: the locale-id charset guard at
//! this new entry point, the argument caps, and the one value in the response
//! a consumer hands BACK to the engine.

use super::{ok_call, spellings};
use crate::rpc::INVALID_PARAMS;
use crate::test_support::{call_tool, content};
use crate::tools::sources::MAX_INLINE_BYTES;
use serde_json::{json, Value};
use shojiku_authoring::MAX_PROBES;

#[test]
fn a_traversing_locale_id_is_refused_before_any_file_is_opened() {
    // The id becomes a file name, so `load_locale_pack` guards its charset.
    // This tool is a NEW entry point into that guard: nothing stops a later
    // edit from routing around it, and the case costs one call.
    let result = call_tool(
        "format_catalog",
        json!({ "lang": "../../../../etc/passwd" }),
    )
    .expect("an in-band failure, not a protocol error");
    assert_eq!(result["isError"], true);
    let message = content(&result)[0]["text"].as_str().expect("text");
    assert!(message.contains("invalid characters"), "{message}");
    // The id is quoted back on purpose — it is the caller's own input, and
    // the message exists to say WHICH id was refused. What has to hold is
    // that the echo is bounded and control-free, which the next case pins
    // at the cap.
    assert!(message.contains("../../../../etc/passwd"), "{message}");
}

#[test]
fn a_hostile_locale_id_is_echoed_clipped_and_control_free() {
    let hostile = format!("{}\u{7}", "z".repeat(400));
    let result = call_tool("format_catalog", json!({ "lang": hostile }))
        .expect("an in-band failure, not a protocol error");
    assert_eq!(result["isError"], true);
    let message = content(&result)[0]["text"].as_str().expect("text");
    assert!(!message.contains('\u{7}'), "{message}");
    assert!(
        !message.contains(&"z".repeat(shojiku_diagnostics::MAX_ECHO + 1)),
        "the id was echoed past the cap: {} chars",
        message.chars().count()
    );
}

#[test]
fn a_hostile_registry_name_is_not_offered_as_a_pick() {
    // A spelling here is authored back as `format: <spelling>`, so a name
    // that does not survive the echo guard unchanged must be OMITTED rather
    // than offered under a sanitized spelling the registry does not hold.
    // `stamp` beside it is the positive control: without it, an empty
    // registry half would satisfy the negative assertion on its own.
    let long = "n".repeat(shojiku_diagnostics::MAX_ECHO + 1);
    let template = format!(
        "formats:\n  \"{long}\": {{ type: date, pattern: \"yyyy\" }}\n  \
         stamp: {{ type: date, pattern: \"yyyy.MM.dd\" }}\n\
         sections:\n  body:\n    type: flow\n    items: []\n"
    );
    let (catalog, _) = ok_call(json!({ "template": template, "lang": "ja-JP" }));
    let date = spellings(&catalog, "date");
    assert!(
        date.iter().any(|s| s == "stamp"),
        "control failed: {date:?}"
    );
    assert!(
        !date.iter().any(|s| s.starts_with("nn")),
        "the unpickable name was offered: {date:?}"
    );
}

#[test]
fn too_many_probes_is_an_invalid_params_refusal() {
    let probes: Vec<Value> = (0..=MAX_PROBES)
        .map(|_| json!({ "fieldType": "date", "pattern": "yyyy" }))
        .collect();
    let (code, message) = call_tool("format_catalog", json!({ "probes": probes })).unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
    // Both halves: how many were sent AND what the cap is. Naming only the
    // cap leaves a client guessing whether it overshot by one or by a
    // thousand.
    assert!(message.contains(&(MAX_PROBES + 1).to_string()), "{message}");
    assert!(message.contains(&MAX_PROBES.to_string()), "{message}");
    assert!(!message.contains("yyyy"), "an entry was echoed: {message}");
}

#[test]
fn a_field_type_with_no_pattern_form_is_invalid_params() {
    // `currency` is a real field type with no pattern form at all, so
    // accepting it would answer a question the wire cannot be asked.
    let (code, _) = call_tool(
        "format_catalog",
        json!({ "probes": [{ "fieldType": "currency", "pattern": "x" }] }),
    )
    .unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
}

#[test]
fn a_hostile_field_type_comes_back_clipped_and_control_free() {
    // Built through `json!` rather than string interpolation: a raw control
    // character pasted into a JSON literal makes the whole frame invalid,
    // which would exercise the parse path instead of the echo guard.
    let hostile = format!("t{}\u{7}", "x".repeat(400));
    let (code, message) = call_tool(
        "format_catalog",
        json!({ "probes": [{ "fieldType": hostile, "pattern": "x" }] }),
    )
    .unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
    assert!(!message.contains('\u{7}'), "{message}");
    assert!(
        !message.contains(&"x".repeat(shojiku_diagnostics::MAX_ECHO + 1)),
        "the field type was echoed past the cap: {} chars",
        message.chars().count()
    );
}

#[test]
fn a_wrong_shaped_probe_list_is_invalid_params() {
    for arguments in [
        json!({ "probes": "date:yyyy" }),
        json!({ "probes": ["date:yyyy"] }),
        json!({ "probes": [{ "fieldType": "date" }] }),
        json!({ "probes": [{ "pattern": "yyyy" }] }),
    ] {
        let (code, _) = call_tool("format_catalog", arguments.clone())
            .expect_err("the wrong shape was accepted");
        assert_eq!(code, INVALID_PARAMS, "{arguments}");
    }
}

#[test]
fn an_over_cap_inline_template_is_refused_here_too() {
    let huge = "#".repeat(MAX_INLINE_BYTES + 1);
    let (code, message) = call_tool("format_catalog", json!({ "template": huge })).unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
    assert!(message.contains("templatePath"), "{message}");
    assert!(
        message.contains(&MAX_INLINE_BYTES.to_string()),
        "the refusal does not say what the cap is: {message}"
    );
}

#[test]
fn an_unloadable_locale_wins_over_an_unparseable_template() {
    // Which error wins when two inputs are broken at once is observable
    // behaviour that no happy-path test pins. Here the pack error must
    // win, and for a reason the ordering makes structural rather than
    // arbitrary: there is no catalog at all without a pack, so the parse
    // diagnostic has nothing to ride on. (`prepare_from` resolves the
    // opposite way because a template error is fatal there anyway.)
    let result = call_tool(
        "format_catalog",
        json!({ "template": "formats: [not a mapping\n", "lang": "no-SUCH" }),
    )
    .expect("an in-band failure, not a protocol error");
    assert_eq!(result["isError"], true);
    let message = content(&result)[0]["text"].as_str().expect("text");
    assert!(message.contains("no-SUCH"), "{message}");
    assert!(
        !message.contains("parse"),
        "the parse diagnostic cannot ride a failure: {message}"
    );
}
