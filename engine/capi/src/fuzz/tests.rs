//! The C ABI harness: one input per flag, and the property failures it
//! catches.

use super::*;

/// The smallest template that parses and validates.
const TEMPLATE: &str = "sections:\\n  body:\\n    type: flow\\n    items: []\\n";

#[test]
fn every_kind_of_request_sets_its_flag() {
    let valid = format!("{{\"template\":\"{TEMPLATE}\"}}");
    assert!(request(valid.as_bytes()).valid);
    assert!(request(b"{\"template\":\"sections: {}\"}").refused);
    assert!(request(b"\xff").invalid_utf8);
    for refused in [
        "[]",
        "{\"template\":\"\",\"nope\":1}",
        "{\"template\":\"\",\"scale\":0}",
        "{\"template\":\"\",\"scale\":10.5}",
    ] {
        assert!(request(refused.as_bytes()).invalid_request, "{refused}");
    }
    assert!(request(b"{\"template\":\"\",\"scale\":0}").scale_refused);
    let ids = vec!["\"a\""; 257].join(",");
    let over = format!("{{\"template\":\"\",\"denyDynamicImage\":[{ids}]}}");
    let paths = request(over.as_bytes());
    assert!(paths.invalid_request && paths.too_many_ids && !paths.scale_refused);
    assert!(request(b"").invalid_request);
}

#[test]
fn an_envelope_refused_for_another_reason_sets_no_bound_flag() {
    let ids = vec!["\"a\""; 257].join(",");
    for refused in [
        "[]".to_owned(),
        "{\"template\":\"\",\"nope\":1,\"scale\":0}".to_owned(),
        format!("{{\"nope\":1,\"allowDynamicImage\":[{ids}]}}"),
        "{\"template\":\"\",\"scale\":\"x\"}".to_owned(),
        // A duplicate key, and an id of another type past the cap.
        "{\"template\":\"\",\"scale\":1,\"scale\":0}".to_owned(),
        format!("{{\"template\":\"\",\"denyDynamicImage\":[{ids},1]}}"),
        format!("{{\"template\":\"\",\"scale\":0,\"denyDynamicImage\":[{ids}]}}"),
    ] {
        assert_eq!(
            request(refused.as_bytes()),
            RequestPaths {
                invalid_request: true,
                ..RequestPaths::default()
            },
            "{refused}"
        );
    }
}

#[test]
#[should_panic(expected = "was accepted")]
fn an_accepted_scale_out_of_range_fails() {
    assert_accepted_bounds("{\"scale\":11}");
}

#[test]
#[should_panic(expected = "entries was accepted")]
fn an_accepted_id_list_over_the_cap_fails() {
    let ids = vec!["\"a\""; 257].join(",");
    assert_accepted_bounds(&format!("{{\"allowDynamicImage\":[{ids}]}}"));
}

#[test]
#[should_panic(expected = "another status")]
fn a_failure_with_another_status_fails() {
    let outcome = Outcome {
        status: SHOJIKU_OK,
        success: 0,
        diagnostics: String::new(),
        error: String::new(),
    };
    assert_failed(&outcome, SHOJIKU_ERR_INVALID_UTF8, "invalid_utf8");
}
