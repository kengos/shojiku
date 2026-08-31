//! Which spellings each field type offers, and what each one renders.
//!
//! Split from the module root for the line budget; the root owns the wire
//! TYPES and the entry point, this owns the enumeration.

use super::exemplar;
use super::{FormatOrigin, FormatTypeEntry, FormatVariant, CURRENCY_VARIANTS};
use serde_json::{json, Value};
use shojiku_core::{FieldType, NamedFormat, NamedFormatKind, Template};
use shojiku_diagnostics::{sanitize, MAX_ECHO};
use shojiku_formatter::{format_value, FormatContext, LangPack};
use std::collections::BTreeMap;

pub(super) fn type_entry(
    field_type: FieldType,
    template: Option<&Template>,
    pack: &LangPack,
    ctx: &FormatContext,
) -> FormatTypeEntry {
    let fixed = matches!(
        field_type,
        FieldType::Number | FieldType::Percentage | FieldType::Quantity
    );
    FormatTypeEntry {
        field_type: field_type.as_str().to_string(),
        fixed,
        variants: spellings(field_type, template, pack)
            .into_iter()
            .map(|(spelling, origin)| FormatVariant {
                samples: render(field_type, Some(&spelling), pack, ctx),
                drops_time: drops_time(field_type, &spelling, pack, ctx),
                spelling,
                origin,
            })
            .collect(),
    }
}

/// The pickable spellings for a type, in the order an editor lists them:
/// the document's own registry entries first (they are what an author
/// named), then what the locale and the engine supply.
fn spellings(
    field_type: FieldType,
    template: Option<&Template>,
    pack: &LangPack,
) -> Vec<(String, FormatOrigin)> {
    let mut out: Vec<(String, FormatOrigin)> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let mut push = |name: String, origin: FormatOrigin, seen: &mut Vec<String>| {
        if !seen.contains(&name) {
            seen.push(name.clone());
            out.push((name, origin));
        }
    };
    if matches!(field_type, FieldType::Date | FieldType::Datetime) {
        for name in template
            .map(|t| registry_names(&t.formats, field_type))
            .unwrap_or_default()
        {
            push(name, FormatOrigin::Registry, &mut seen);
        }
        for map in pack_maps(field_type, pack) {
            for name in map.keys().filter(|n| pickable(n)) {
                push(name.clone(), FormatOrigin::Pack, &mut seen);
            }
        }
    }
    if field_type == FieldType::Currency {
        for name in CURRENCY_VARIANTS {
            push(name.to_string(), FormatOrigin::Builtin, &mut seen);
        }
    }
    // Every type resolves `default`, and a pack that declares no `default`
    // still renders one (the engine's own pattern), so the row is never
    // empty — which is what lets a fixed type report its rendering.
    push("default".to_string(), FormatOrigin::Builtin, &mut seen);
    out
}

/// Whether a name can be OFFERED as a pick.
///
/// A spelling in this catalog is not only displayed — a picker authors it
/// back into the document as `format: <spelling>`. So a name that does not
/// survive the echo guard unchanged must not be offered at all: the pick
/// would write the SANITIZED spelling, which is not the key the registry
/// (or the pack) holds, and the reference would resolve to nothing and warn
/// `unknown_format_variant`. Clipping and stripping are still required —
/// the names are attacker-controlled and this response is not a diagnostic,
/// so it inherits no bound of its own — but a name that needed either is
/// unpickable rather than pickable-and-wrong.
///
/// Such an entry stays fully visible where it is EDITABLE: the registry
/// surface reads the document itself, not this catalog.
fn pickable(name: &str) -> bool {
    sanitize(name, MAX_ECHO) == name
}

/// The registry entries a type may reference. A `datetime` entry is not a
/// `date` format: `render_dated` looks a name up in the registry before
/// the pack, so offering one under the wrong type would author a pick that
/// renders the wrong shape rather than warning.
fn registry_names(registry: &BTreeMap<String, NamedFormat>, field_type: FieldType) -> Vec<String> {
    registry
        .iter()
        .filter(|(name, entry)| kind_matches(entry, field_type) && pickable(name))
        .map(|(name, _)| name.clone())
        .collect()
}

fn kind_matches(entry: &NamedFormat, field_type: FieldType) -> bool {
    matches!(
        (entry.kind, field_type),
        (NamedFormatKind::Date, FieldType::Date) | (NamedFormatKind::Datetime, FieldType::Datetime)
    )
}

fn pack_maps(field_type: FieldType, pack: &LangPack) -> Vec<&BTreeMap<String, String>> {
    match field_type {
        FieldType::Datetime => vec![&pack.datetime_formats, &pack.date_formats],
        _ => vec![&pack.date_formats],
    }
}

/// Renders a type's exemplar value(s) through one variant.
fn render(
    field_type: FieldType,
    variant: Option<&str>,
    pack: &LangPack,
    ctx: &FormatContext,
) -> Vec<String> {
    exemplar::values(field_type)
        .iter()
        .map(|value| render_one(value, field_type, variant, pack, ctx))
        .collect()
}

/// One value through one variant, as the type's own exemplar spec.
///
/// `pub(super)` because the locale facts (`facts.rs`) render the same
/// exemplars through it: the one dispatch has one caller-facing door here,
/// so a second surface cannot grow a second formatter.
pub(super) fn render_one(
    value: &Value,
    field_type: FieldType,
    variant: Option<&str>,
    pack: &LangPack,
    ctx: &FormatContext,
) -> String {
    let spec = exemplar::spec(field_type);
    format_value(value, Some(&spec), variant, *ctx, pack)
        .map(|f| f.text)
        // The exemplars are engine constants of the right shape, so a parse
        // failure is unreachable from here; an empty sample is still the
        // honest answer if one ever is not.
        .unwrap_or_default()
}

/// Whether this variant renders a datetime WITHOUT its time.
///
/// A datetime slot resolves the pack's DATE table after its own, so a
/// date-table name (`compact`, `wareki-compact`) is offered there and
/// renders date-only — and so does a datetime-table entry the pack
/// authored with no time tokens (every shipped pack's `datetimeFormats.date`
/// is exactly that). Both discard part of the value, so the catalog says
/// so rather than leaving an editor to infer it by eye from the sample.
///
/// **Measured, not tabulated**: the variant renders the exemplar and its
/// same-day twin at a different time, and identical output means no time
/// token survived (see [`exemplar::DATED_OTHER_TIME`]). That answers for a
/// third-party pack and for an author's own `formats:` entry too, which a
/// hand-written list of spellings could not — and it cannot drift from the
/// dispatch, because it IS the dispatch.
///
/// False for every other type: only a datetime carries a time to lose.
fn drops_time(field_type: FieldType, spelling: &str, pack: &LangPack, ctx: &FormatContext) -> bool {
    if field_type != FieldType::Datetime {
        return false;
    }
    let pick = Some(spelling);
    render_one(&json!(exemplar::DATED), field_type, pick, pack, ctx)
        == render_one(
            &json!(exemplar::DATED_OTHER_TIME),
            field_type,
            pick,
            pack,
            ctx,
        )
}
