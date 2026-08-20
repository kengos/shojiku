//! Each exemplar must discriminate the variants it is shown to explain.

use super::*;

// ── the exemplars discriminate what they illustrate ──────────────────────

#[test]
fn the_date_exemplar_separates_every_variant_it_is_shown_for() {
    let cat = catalog(&empty_template());
    let date = entry(&cat, "date");
    let rendered: Vec<&Vec<String>> = date.variants.iter().map(|v| &v.samples).collect();
    for (i, a) in rendered.iter().enumerate() {
        for (j, b) in rendered.iter().enumerate() {
            if i < j {
                assert_ne!(
                    a, b,
                    "`{}` and `{}` render the same text, so the sample explains nothing",
                    date.variants[i].spelling, date.variants[j].spelling
                );
            }
        }
    }
}

#[test]
fn the_number_exemplar_separates_uniform_from_indian_grouping() {
    // Four digits — the shape a locale panel once used — group identically
    // under both rules, so this is the property the exemplar exists for.
    let uniform = catalog(&empty_template());
    let indian_pack =
        LangPack::from_yaml_str("id: xx-XX\nnumber:\n  groupSize: 3\n  secondaryGroupSize: 2\n")
            .expect("pack");
    let template = empty_template();
    let indian = format_catalog(Some(&template), &indian_pack, &[]);
    assert_ne!(
        sample_for(&uniform, "number", "default"),
        sample_for(&indian, "number", "default"),
        "the number exemplar must render differently under lakh/crore grouping"
    );
}

#[test]
fn the_percentage_exemplar_is_a_fraction() {
    // The formatter scales by 100, so an exemplar written as a percent
    // would teach the wrong wire.
    let cat = catalog(&empty_template());
    assert!(sample_for(&cat, "percentage", "default").starts_with("12.34"));
}

#[test]
fn the_quantity_row_samples_both_plural_arms() {
    let cat = catalog(&empty_template());
    let samples = &entry(&cat, "quantity").variants[0].samples;
    assert_eq!(samples.len(), 2, "one value cannot show one AND other");
    assert_ne!(samples[0], samples[1]);
}

#[test]
fn a_type_with_no_format_layer_has_no_exemplar_at_all() {
    // `format:` does not apply to a string, a boolean or an image, so the
    // catalog never asks these for a sample. The arm must stay EMPTY rather
    // than inventing one: a sample here would illustrate a `format:` the
    // engine would refuse on the field it was shown for.
    for field_type in [FieldType::String, FieldType::Boolean, FieldType::Image] {
        assert!(
            exemplar::values(field_type).is_empty(),
            "{field_type:?} has no format layer, so it can carry no exemplar"
        );
    }
}
