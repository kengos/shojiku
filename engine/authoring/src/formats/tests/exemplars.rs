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

#[test]
fn every_pattern_token_is_classified_against_the_exemplars() {
    // The append-only guard `drops_time` rests on. It reads "this variant
    // shows no time" off two renders of the SAME DAY at different times, so a
    // TIME-derived token that renders identically for both instants would be
    // invisible to it — a variant showing only that token would be reported
    // as date-only.
    //
    // The assertion is a SNAPSHOT of both axes, not a rule, because no test
    // can tell a time token from a date token without being handed a list —
    // and a hand-authored list of "which tokens mean time" is exactly the
    // table this whole change exists to delete. Instead each token is
    // rendered against an instant differing only in TIME and one differing
    // only in DATE, and the two resulting sets are pinned. Any token added
    // later lands in one, both, or neither, and reds this test — at which
    // point the author has to say which it is.
    //
    // Weaker forms do not hold. "Differs under at least one axis" passes a
    // time-derived token that merely varies by day (a zone token across DST),
    // which is precisely the case `drops_time` would get wrong.
    let pack = ja();
    let spec = exemplar::spec(FieldType::Datetime);
    let render = |value: &str, token: &str| -> String {
        let defaults = FormatDefaults {
            datetime: Some(FormatRef::Inline(InlineFormat {
                pattern: token.to_string(),
            })),
            ..FormatDefaults::default()
        };
        let ctx = FormatContext {
            defaults: Some(&defaults),
            named: None,
            currency: None,
        };
        shojiku_formatter::format_value(&json!(value), Some(&spec), None, ctx, &pack)
            .expect("exemplar formats")
            .text
    };
    // Same time of day, a different date — and far enough back to cross an
    // ERA, so the era tokens are exercised rather than coincidentally equal.
    const OTHER_DAY: &str = "1988-03-19T14:05:00+09:00";
    let mut moves_with_time: Vec<&str> = Vec::new();
    let mut moves_with_date: Vec<&str> = Vec::new();
    for token in shojiku_formatter::PATTERN_TOKENS {
        let base = render(exemplar::DATED, token);
        if base != render(exemplar::DATED_OTHER_TIME, token) {
            moves_with_time.push(token);
        }
        if base != render(OTHER_DAY, token) {
            moves_with_date.push(token);
        }
    }
    moves_with_time.sort_unstable();
    moves_with_date.sort_unstable();
    assert_eq!(
        moves_with_time,
        ["H", "HH", "a", "h", "hh", "mm", "ss"],
        "the TIME-visible token set moved. A token that means time and is NOT \
         here is invisible to `drops_time`: move the exemplar pair so it \
         discriminates, rather than accepting the new set"
    );
    assert_eq!(
        moves_with_date,
        ["E", "EEEE", "G", "GG", "M", "MM", "MMM", "MMMM", "d", "dd", "y", "yyyy"],
        "the DATE-visible token set moved — classify the new token"
    );
    // Nothing may be invisible to both: such a token renders the same text for
    // every instant, which is a token that does nothing.
    for token in shojiku_formatter::PATTERN_TOKENS {
        assert!(
            moves_with_time.contains(token) || moves_with_date.contains(token),
            "`{token}` renders identically for every instant"
        );
    }
}
