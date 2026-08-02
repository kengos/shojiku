//! Direct unit tests for the schema-check helpers whose branches the
//! validate-level suite cannot reach (a `null` never reaches `json_type`
//! — the blank skip catches it first).

use super::json_type;
use serde_json::json;

#[test]
fn json_type_names_every_value_kind() {
    assert_eq!(json_type(&serde_json::Value::Null), "null");
    assert_eq!(json_type(&json!(true)), "boolean");
    assert_eq!(json_type(&json!(1.5)), "number");
    assert_eq!(json_type(&json!("s")), "string");
    assert_eq!(json_type(&json!([1])), "array");
    assert_eq!(json_type(&json!({})), "object");
}
