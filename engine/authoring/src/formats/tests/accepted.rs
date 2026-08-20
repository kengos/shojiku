//! The catalog describes what the engine ACCEPTS, not what parses.

use super::*;

// ── the catalog describes what the engine ACCEPTS ────────────────────────

#[test]
fn every_declared_spelling_renders_without_a_degradation() {
    // The positive half of the two-sided check. A variant the catalog
    // offers must format cleanly; one that warned would be a picker
    // offering a live diagnostic.
    let template = empty_template();
    let pack = ja();
    let ctx = FormatContext {
        defaults: None,
        named: Some(&template.formats),
        currency: None,
    };
    let cat = catalog(&template);
    for t in &cat.types {
        let field_type = FieldType::from_name(&t.field_type).expect("known type");
        for v in &t.variants {
            let spec = exemplar::spec(field_type);
            for value in exemplar::values(field_type) {
                let out = shojiku_formatter::format_value(
                    &value,
                    Some(&spec),
                    Some(&v.spelling),
                    ctx,
                    &pack,
                )
                .expect("exemplar formats");
                assert_eq!(
                    out.warning, None,
                    "`{}` on `{}` degraded",
                    v.spelling, t.field_type
                );
            }
        }
    }
}

#[test]
fn a_spelling_the_catalog_excludes_does_degrade() {
    // The half that can catch a catalog claiming MORE than the engine
    // takes — the only direction that misleads. `wareki` is a real date
    // variant, and putting it on `currency` is exactly the mistake a
    // too-wide catalog would invite.
    let cat = catalog(&empty_template());
    let currency = entry(&cat, "currency");
    assert!(
        !currency.variants.iter().any(|v| v.spelling == "wareki"),
        "the catalog must not offer `wareki` for currency"
    );
    let out = shojiku_formatter::format_value(
        &serde_json::json!(exemplar::CURRENCY),
        Some(&exemplar::spec(FieldType::Currency)),
        Some("wareki"),
        FormatContext::default(),
        &ja(),
    )
    .expect("formats");
    assert!(out.warning.is_some(), "the excluded spelling must warn");
}

#[test]
fn number_percentage_and_quantity_are_reported_as_fixed() {
    // They have no named variants in v1 (`format.rs`: any pick but
    // `default` warns), so an editor must not offer a control for them.
    let cat = catalog(&empty_template());
    for name in ["number", "percentage", "quantity"] {
        let t = entry(&cat, name);
        assert!(t.fixed, "`{name}` has no real choice");
        assert_eq!(t.variants.len(), 1, "`{name}` offers only `default`");
    }
    for name in ["date", "datetime", "currency"] {
        assert!(!entry(&cat, name).fixed, "`{name}` has a real choice");
    }
}
