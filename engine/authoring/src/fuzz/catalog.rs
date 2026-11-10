//! The format-catalog harness the `authoring_format_catalog` fuzz target
//! and the corpus replay test both run.
//!
//! An editor asks for the catalog on every keystroke, with the document
//! as typed so far and pattern probes it supplies, and authors a picked
//! spelling back into the document as `format: <spelling>`. The harness
//! builds the catalog for one template text, a builtin locale and the
//! probes, and asserts: the types are listed in the editor's fixed order,
//! and only `number`, `percentage` and `quantity` are fixed; each type's
//! spellings are distinct, survive the echo guard unchanged, include
//! `default`, and give one sample each (two for `quantity`); a spelling
//! from the document's `formats:` registry is listed only on `date` and
//! `datetime`, before every other spelling, and the registry spellings of
//! a type are its first `MAX_FORMATS` entries, in name order, whose name
//! survives the echo guard; only a `datetime` spelling may drop the time
//! (a property with no positive control: no assertion fixes which
//! `datetime` spelling drops it); a template text that does not parse is
//! passed to `format_catalog` as no template, as the wasm, MCP and CLI
//! hosts pass it; there is one probe result per probe, refused past
//! `MAX_PROBES` probes or `MAX_PROBE_PATTERN` characters and not refused
//! otherwise (the sample a probe gives is not checked); and the same
//! input gives the same catalog twice.

use crate::formats::{
    FormatCatalog, FormatOrigin, MAX_PROBE_PATTERN, MAX_PROBES, PatternProbe, ProbeError,
    ProbeRefusal, format_catalog,
};
use crate::locale::load_pack;
use shojiku_core::{MAX_FORMATS, NamedFormatKind, Template, parse_template};
use shojiku_diagnostics::{MAX_ECHO, sanitize};

#[cfg(test)]
mod tests;

/// The field types the catalog lists, in the order an editor shows them,
/// and whether each is fixed.
const TYPES: [(&str, bool); 6] = [
    ("date", false),
    ("datetime", false),
    ("currency", false),
    ("number", true),
    ("percentage", true),
    ("quantity", true),
];

/// The most probe lines the harness reads. Past [`MAX_PROBES`], so the
/// refusal of the extra probes is reachable, and bounded, so one input
/// costs a bounded number of formatter calls.
const MAX_PROBE_LINES: usize = MAX_PROBES + 4;

/// Which assertions one input checked on a result a no-op engine would not
/// give, for the replay test's positive controls. Each flag is set after the
/// assertion it guards passed.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct CatalogPaths {
    /// A type listed registry spellings, which were the type's first
    /// `MAX_FORMATS` pickable entries in name order; an engine that ignored
    /// the registry would list none.
    pub registry: bool,
    /// A registry name that does not survive the echo guard is among the
    /// first `MAX_FORMATS` entries of its type, so an engine without the
    /// echo-guard filter would list it and fail the pickable check. No seed
    /// holds more than `MAX_FORMATS` entries of one type, so the cap is
    /// checked by the unit tests of the format catalog.
    pub unpickable: bool,
    /// A probe was refused for its pattern length.
    pub pattern_too_long: bool,
    /// A probe was refused for its position past the probe cap.
    pub too_many_probes: bool,
    /// A probe line named a type with no pattern form.
    pub no_pattern_form: bool,
}

/// Builds the catalog for one fuzz input and asserts the properties in the
/// module documentation. The first line picks the locale (`locale=en-US`,
/// else `ja-JP`); each following `probe=<type> <pattern>` line adds a
/// probe, until a `---` line; the rest is the template text.
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn catalog(input: &str) -> CatalogPaths {
    let mut lines = input.split('\n');
    let locale = match lines.next() {
        Some("locale=en-US") => "en-US",
        _ => "ja-JP",
    };
    let pack = load_pack(locale, None).expect("a builtin locale loads");
    let mut paths = CatalogPaths::default();
    let mut probes = Vec::new();
    let mut source = String::new();
    for line in lines.by_ref() {
        if line == "---" {
            break;
        }
        if let Some(probe) = line.strip_prefix("probe=")
            && probes.len() < MAX_PROBE_LINES
        {
            read_probe(probe, &mut probes, &mut paths);
        }
    }
    for line in lines {
        source.push_str(line);
        source.push('\n');
    }
    let template = parse_template(&source).ok();
    let cat = format_catalog(template.as_ref(), &pack, &probes);
    assert_eq!(
        cat,
        format_catalog(template.as_ref(), &pack, &probes),
        "the same input gave a different catalog"
    );
    check_types(&cat, template.as_ref(), &mut paths);
    if let Some(t) = &template {
        paths.unpickable = unfiltered_lists_unpickable(t);
    }
    check_probes(&cat, &probes, &mut paths);
    paths
}

/// The registry names a type lists: in name order, the entries of `kind`
/// whose name survives the echo guard, at most `MAX_FORMATS` of them.
fn pickable_registry(template: Option<&Template>, kind: Option<NamedFormatKind>) -> Vec<&str> {
    template
        .into_iter()
        .flat_map(|t| &t.formats)
        .filter(|(name, entry)| Some(entry.kind) == kind && sanitize(name, MAX_ECHO) == **name)
        .map(|(name, _)| name.as_str())
        .take(MAX_FORMATS)
        .collect()
}

/// Whether an engine that listed the first `MAX_FORMATS` registry entries
/// of each type, without the echo-guard filter, would list a name the echo
/// guard changes.
fn unfiltered_lists_unpickable(template: &Template) -> bool {
    [NamedFormatKind::Date, NamedFormatKind::Datetime]
        .into_iter()
        .any(|kind| {
            template
                .formats
                .iter()
                .filter(|(_, entry)| entry.kind == kind)
                .take(MAX_FORMATS)
                .any(|(name, _)| sanitize(name, MAX_ECHO) != *name)
        })
}

/// Reads one `<type> <pattern>` probe line.
fn read_probe(line: &str, probes: &mut Vec<PatternProbe>, paths: &mut CatalogPaths) {
    let (name, pattern) = line.split_once(' ').unwrap_or((line, ""));
    // Only `date` and `datetime` have a pattern form.
    let pattern_form = matches!(name, "date" | "datetime");
    match PatternProbe::new(name, pattern) {
        Ok(probe) => {
            assert!(pattern_form, "a probe of `{name}` was accepted");
            probes.push(probe);
        }
        Err(error) => {
            assert!(
                !pattern_form && matches!(error, ProbeError::NoPatternForm(_)),
                "a probe of `{name}` was refused, or refused for another reason"
            );
            let message = error.to_string();
            assert_eq!(
                sanitize(&message, usize::MAX),
                message,
                "a probe refusal holds a character the echo guard strips"
            );
            paths.no_pattern_form = true;
        }
    }
}

/// Checks every type entry against the template's registry.
fn check_types(cat: &FormatCatalog, template: Option<&Template>, paths: &mut CatalogPaths) {
    let listed: Vec<(&str, bool)> = cat
        .types
        .iter()
        .map(|t| (t.field_type.as_str(), t.fixed))
        .collect();
    assert_eq!(listed, TYPES, "the types are not the fixed list");
    for entry in &cat.types {
        let names: Vec<&str> = entry.variants.iter().map(|v| v.spelling.as_str()).collect();
        let mut distinct = names.clone();
        distinct.sort_unstable();
        distinct.dedup();
        assert_eq!(distinct.len(), names.len(), "a type lists a spelling twice");
        assert!(names.contains(&"default"), "a type does not list `default`");
        let kind = match entry.field_type.as_str() {
            "date" => Some(NamedFormatKind::Date),
            "datetime" => Some(NamedFormatKind::Datetime),
            _ => None,
        };
        let samples = if entry.field_type == "quantity" { 2 } else { 1 };
        let mut registry = Vec::new();
        for (at, variant) in entry.variants.iter().enumerate() {
            let spelling = variant.spelling.as_str();
            assert_eq!(
                sanitize(spelling, MAX_ECHO),
                spelling,
                "an unpickable spelling is listed"
            );
            assert_eq!(
                variant.samples.len(),
                samples,
                "a spelling has another sample count"
            );
            assert!(
                !variant.drops_time || entry.field_type == "datetime",
                "a spelling outside `datetime` drops the time"
            );
            if variant.origin == FormatOrigin::Registry {
                assert_eq!(
                    at,
                    registry.len(),
                    "a registry spelling follows another spelling"
                );
                registry.push(spelling);
            }
        }
        let want = pickable_registry(template, kind);
        assert_eq!(
            registry, want,
            "the registry spellings are not the first MAX_FORMATS pickable entries of the type"
        );
        paths.registry |= !want.is_empty();
    }
}

/// Checks one probe result per probe, refused past its caps and not
/// refused otherwise.
fn check_probes(cat: &FormatCatalog, probes: &[PatternProbe], paths: &mut CatalogPaths) {
    assert_eq!(
        cat.probes.len(),
        probes.len(),
        "the probe results are not one per probe"
    );
    for (at, (probe, result)) in probes.iter().zip(&cat.probes).enumerate() {
        let expected = if at >= MAX_PROBES {
            Some(ProbeRefusal::TooManyProbes)
        } else if probe.pattern.chars().count() > MAX_PROBE_PATTERN {
            Some(ProbeRefusal::PatternTooLong)
        } else {
            None
        };
        assert_eq!(
            result.refused, expected,
            "a probe was refused within its caps or not refused past them"
        );
        match expected {
            Some(ProbeRefusal::TooManyProbes) => paths.too_many_probes = true,
            Some(ProbeRefusal::PatternTooLong) => paths.pattern_too_long = true,
            None => {}
        }
        if expected.is_some() {
            assert!(
                result.sample.is_empty() && result.warning.is_none(),
                "a refused probe carries a sample or a warning"
            );
        }
    }
}
