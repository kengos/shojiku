//! The format-catalog harness: one input per flag, and the property
//! failures it catches.

use super::*;
use crate::formats::{FormatTypeEntry, FormatVariant, ProbeResult};

/// The smallest template body that parses.
const BODY: &str = "sections:\n  body:\n    type: flow\n    items: []\n";

#[test]
fn a_parsed_template_with_a_registry_and_probes_sets_their_flags() {
    let long = "y".repeat(MAX_PROBE_PATTERN + 1);
    let mut input = format!("locale=en-US\nprobe=date yyyy\nprobe=date {long}\nprobe=number x\n");
    for _ in 0..MAX_PROBES {
        input.push_str("probe=datetime HH\n");
    }
    input.push_str("---\nformats:\n  stamp: { type: date, pattern: \"yyyy\" }\n");
    input.push_str("  \"bad\\u0007\": { type: date, pattern: d }\n");
    input.push_str(BODY);
    let paths = catalog(&input);
    assert_eq!(
        paths,
        CatalogPaths {
            registry: true,
            unpickable: true,
            pattern_too_long: true,
            too_many_probes: true,
            no_pattern_form: true,
        }
    );
}

#[test]
fn an_unparsed_template_lists_no_registry_spelling() {
    let paths = catalog("locale=ja-JP\n---\nformats: [\n");
    assert_eq!(paths, CatalogPaths::default());
}

#[test]
fn an_unpickable_name_past_the_registry_cap_sets_no_flag() {
    let mut input = String::from("locale=ja-JP\n---\nformats:\n");
    for at in 0..MAX_FORMATS {
        input.push_str(&format!("  a{at:03}: {{ type: date, pattern: d }}\n"));
    }
    input.push_str("  \"z\\u0007\": { type: date, pattern: d }\n");
    input.push_str(BODY);
    let paths = catalog(&input);
    assert!(paths.registry && !paths.unpickable);
}

#[test]
fn an_input_with_one_line_has_no_probes_and_no_template() {
    assert_eq!(catalog("x"), CatalogPaths::default());
}

#[test]
fn probe_lines_past_the_probe_cap_are_refused() {
    let input = "probe=date d\n".repeat(MAX_PROBE_LINES + 3);
    let cat_input = format!("locale=ja-JP\n{input}");
    let paths = catalog(&cat_input);
    assert!(paths.too_many_probes);
}

/// A catalog whose `date` entry holds `variants`, with every other type
/// as the catalog of no template lists it.
fn with_date(variants: Vec<FormatVariant>) -> FormatCatalog {
    let pack = load_pack("ja-JP", None).expect("builtin");
    let mut cat = format_catalog(None, &pack, &[]);
    cat.types[0] = FormatTypeEntry {
        field_type: "date".into(),
        fixed: false,
        variants,
    };
    cat
}

fn variant(spelling: &str, origin: FormatOrigin) -> FormatVariant {
    FormatVariant {
        spelling: spelling.into(),
        origin,
        samples: vec![String::new()],
        drops_time: false,
    }
}

#[test]
#[should_panic(expected = "not the first MAX_FORMATS pickable entries")]
fn a_registry_spelling_without_an_entry_fails() {
    let cat = with_date(vec![
        variant("ghost", FormatOrigin::Registry),
        variant("default", FormatOrigin::Builtin),
    ]);
    check_types(&cat, None, &mut CatalogPaths::default());
}

#[test]
#[should_panic(expected = "not the first MAX_FORMATS pickable entries")]
fn a_catalog_without_the_registry_spellings_fails() {
    let template = parse_template(&format!(
        "formats:\n  stamp: {{ type: date, pattern: d }}\n{BODY}"
    ))
    .expect("parse");
    let cat = with_date(vec![variant("default", FormatOrigin::Builtin)]);
    check_types(&cat, Some(&template), &mut CatalogPaths::default());
}

#[test]
#[should_panic(expected = "follows another spelling")]
fn a_registry_spelling_after_a_pack_spelling_fails() {
    let template = parse_template(&format!(
        "formats:\n  stamp: {{ type: date, pattern: d }}\n{BODY}"
    ))
    .expect("parse");
    let cat = with_date(vec![
        variant("compact", FormatOrigin::Pack),
        variant("stamp", FormatOrigin::Registry),
        variant("default", FormatOrigin::Builtin),
    ]);
    check_types(&cat, Some(&template), &mut CatalogPaths::default());
}

#[test]
#[should_panic(expected = "not refused past them")]
fn a_probe_run_past_the_cap_fails() {
    let probes: Vec<PatternProbe> = (0..=MAX_PROBES)
        .map(|_| PatternProbe::new("date", "d").expect("probe"))
        .collect();
    let mut cat = with_date(vec![variant("default", FormatOrigin::Builtin)]);
    cat.probes = probes
        .iter()
        .map(|_| ProbeResult {
            sample: String::new(),
            warning: None,
            refused: None,
        })
        .collect();
    check_probes(&cat, &probes, &mut CatalogPaths::default());
}
