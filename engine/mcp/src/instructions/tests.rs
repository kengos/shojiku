//! The instructions string. These pin the CONTENT the item mandates, not
//! the prose — a rewrite is fine, dropping the staleness rule is not.

use super::INSTRUCTIONS;

#[test]
fn names_the_three_file_model() {
    for file in ["definitions.yml", "templates.yml", "params.json"] {
        assert!(INSTRUCTIONS.contains(file), "missing {file}");
    }
}

#[test]
fn names_the_authoring_loop_in_order() {
    let validate = INSTRUCTIONS.find("validate").expect("validate");
    let preview = INSTRUCTIONS.find("render_preview").expect("render_preview");
    let inspect = INSTRUCTIONS.find("inspect_layout").expect("inspect_layout");
    assert!(validate < preview && preview < inspect, "loop out of order");
}

#[test]
fn points_at_the_example_surface() {
    assert!(INSTRUCTIONS.contains("list_examples"));
    assert!(INSTRUCTIONS.contains("get_example"));
    assert!(INSTRUCTIONS.contains("shojiku://example/"));
}

#[test]
fn points_at_the_reference_surface() {
    // An agent installed as a container has no checkout, so this is the
    // only thing that tells it the syntax reference is reachable at all.
    assert!(INSTRUCTIONS.contains("list_reference"));
    assert!(INSTRUCTIONS.contains("get_reference"));
    assert!(INSTRUCTIONS.contains("#<key>"));
    // A fragment ENUMERATES: on five pages a bare key is a property of
    // several shapes. The one text every agent is guaranteed to see must
    // not describe it as a lookup that answers one node.
    assert!(INSTRUCTIONS.contains("every shape"));
}

#[test]
fn points_at_the_format_vocabulary() {
    // The one surface an author reaches for while WRITING a value rather
    // than after breaking one; without the signpost it is discoverable only
    // by reading `tools/list` closely.
    assert!(INSTRUCTIONS.contains("format_catalog"));
}

#[test]
fn carries_the_staleness_rule() {
    // The one instruction that keeps the other surfaces from being
    // bypassed: the running engine is the authority, not recall.
    assert!(INSTRUCTIONS.contains("training data"));
    assert!(INSTRUCTIONS.contains("authority"));
    assert!(INSTRUCTIONS.contains("capabilities"));
}

#[test]
fn stays_a_signpost_rather_than_a_manual() {
    // Headroom is thin and deliberately so: 52 bytes as this ships, from
    // 389 before the reference surface was named here. The pin is not a
    // ceiling to be raised — the next surface added here shortens
    // something else, which is the point of pinning it at all.
    assert!(
        INSTRUCTIONS.len() < 2500,
        "instructions grew to {} bytes — it is a signpost, not the reference",
        INSTRUCTIONS.len()
    );
    assert!(INSTRUCTIONS.len() > 500);
}

#[test]
fn is_a_single_json_safe_string() {
    // It rides in a JSON-RPC frame; a raw control character would break
    // the one-message-per-line framing.
    assert!(!INSTRUCTIONS.chars().any(|c| c.is_control() && c != '\n'));
}
