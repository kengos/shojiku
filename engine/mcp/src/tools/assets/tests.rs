//! Asset-argument parsing: the mode vocabulary, the bounded id lists, and
//! the root precedence (`assetsDir` > the template file's directory > none).

use super::*;
use serde_json::json;

fn parsed(arguments: &Value) -> AssetArgs {
    let Ok(args) = AssetArgs::parse(arguments) else {
        panic!("expected parsable asset args");
    };
    args
}

fn err(arguments: &Value) -> String {
    let Err((code, message)) = AssetArgs::parse(arguments) else {
        panic!("expected invalid params");
    };
    assert_eq!(code, INVALID_PARAMS);
    message
}

#[test]
fn the_defaults_match_the_cli_defaults() {
    let policy = parsed(&json!({})).policy();
    assert_eq!(policy.mode, AssetMode::Open);
    assert!(policy.dynamic_allow.is_empty() && policy.dynamic_deny.is_empty());
    assert_eq!(
        policy.max_asset_bytes,
        AssetPolicy::default().max_asset_bytes
    );
}

#[test]
fn the_mode_takes_the_cli_value_spelling() {
    assert_eq!(
        parsed(&json!({ "assetMode": "bundled-only" }))
            .policy()
            .mode,
        AssetMode::BundledOnly
    );
    assert_eq!(
        parsed(&json!({ "assetMode": "open" })).policy().mode,
        AssetMode::Open
    );
    assert_eq!(
        parsed(&json!({ "assetMode": null })).policy().mode,
        AssetMode::Open
    );

    let message = err(&json!({ "assetMode": "bundled_only" }));
    assert!(message.contains("`assetMode` must be"), "{message}");
    let message = err(&json!({ "assetMode": 5 }));
    assert!(message.contains("`assetMode`"), "{message}");
}

#[test]
fn the_id_lists_reach_the_policy() {
    let policy = parsed(&json!({
        "allowDynamicImage": ["qr"],
        "denyDynamicImage": ["stamp"],
    }))
    .policy();
    assert_eq!(policy.dynamic_allow, ["qr"]);
    assert_eq!(policy.dynamic_deny, ["stamp"]);
    assert!(parsed(&json!({ "allowDynamicImage": null }))
        .policy()
        .dynamic_allow
        .is_empty());
}

#[test]
fn an_id_list_must_be_an_array_of_strings() {
    for key in ["allowDynamicImage", "denyDynamicImage"] {
        let mut scalar = serde_json::Map::new();
        scalar.insert(key.to_string(), json!("qr"));
        let message = err(&Value::Object(scalar));
        assert!(
            message.contains(key) && message.contains("array"),
            "{message}"
        );

        let mut mixed = serde_json::Map::new();
        mixed.insert(key.to_string(), json!(["qr", 5]));
        let message = err(&Value::Object(mixed));
        assert!(
            message.contains(key) && message.contains("array"),
            "{message}"
        );
    }
}

#[test]
fn an_id_list_is_accepted_at_the_cap_and_refused_past_it() {
    let ids: Vec<String> = (0..MAX_ASSET_IDS).map(|i| format!("item{i}")).collect();
    assert_eq!(
        parsed(&json!({ "allowDynamicImage": ids }))
            .policy()
            .dynamic_allow
            .len(),
        MAX_ASSET_IDS
    );

    let over: Vec<String> = (0..=MAX_ASSET_IDS).map(|i| format!("item{i}")).collect();
    let message = err(&json!({ "denyDynamicImage": over }));
    assert!(
        message.contains(&MAX_ASSET_IDS.to_string()) && message.contains("cap"),
        "{message}"
    );
}

#[test]
fn the_root_prefers_the_assets_dir_over_the_template_directory() {
    let file = Source::Path(PathBuf::from("docs/templates.yml"));
    assert_eq!(
        parsed(&json!({})).root(&file),
        Some(PathBuf::from("docs")),
        "no assetsDir: the template file's own directory"
    );
    assert_eq!(
        parsed(&json!({ "assetsDir": "/srv/assets" })).root(&file),
        Some(PathBuf::from("/srv/assets")),
        "assetsDir wins over the template directory"
    );

    let inline = Source::Inline("page: {}".into());
    assert!(
        parsed(&json!({})).root(&inline).is_none(),
        "an inline template has no bundled root of its own"
    );
    assert_eq!(
        parsed(&json!({ "assetsDir": "/srv/assets" })).root(&inline),
        Some(PathBuf::from("/srv/assets"))
    );
}
