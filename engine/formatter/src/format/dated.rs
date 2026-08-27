//! Resolving a date/datetime pick: which tables a dated field reads, and
//! whether a name is one it can already resolve.
//!
//! Split from the module root for the line budget; the root owns the
//! dispatch, this owns everything that depends on the dated TABLES.

use super::datetime::render_datetime_pattern;
use super::{money, FormatContext, FormatWarning, Formatted, Pick};
use crate::lang::LangPack;
use shojiku_core::FieldType;
use std::collections::BTreeMap;
use time::OffsetDateTime;

/// The tables one dated field type reads, in precedence order. Two slots
/// because a datetime reads two; a date reads one and leaves the second
/// empty rather than allocating.
type Tables<'a> = [Option<&'a BTreeMap<String, String>>; 2];

/// The pack tables `field_type` resolves a name against, in precedence
/// order, paired with the engine's own fallback pattern for a pack that
/// declares no `default`.
///
/// A datetime reads its OWN table first and the date table after it. That
/// order is what lets `wareki` mean the datetime spelling while `compact`
/// still resolves — and it is also why a date-table name on a datetime
/// slot renders without the time. That is offered deliberately; the format
/// catalog reports it per variant rather than letting it pass unsaid.
fn tables<'a>(field_type: FieldType, pack: &'a LangPack) -> (Tables<'a>, &'static str) {
    match field_type {
        FieldType::Datetime => (
            [Some(&pack.datetime_formats), Some(&pack.date_formats)],
            "yyyy-MM-dd HH:mm",
        ),
        // Only [`render`] and [`declares`] reach here, and both have already
        // established a dated type — so this is the DATE arm, written as the
        // fallback because a genuinely unreachable arm would be a line the
        // 100% gate can never cover.
        _ => ([Some(&pack.date_formats), None], "yyyy-MM-dd"),
    }
}

/// Whether `name` is a dated variant this document can already resolve —
/// an entry in the template's `formats:` registry, or a key in a table
/// this field type reads.
///
/// **The contract is agreement with [`render`]**: this returns true for
/// exactly the names `render` finds a pattern for. It guards the
/// type-override check in the dispatch, so a disagreement would let the
/// override steal a pick the renderer was ready to honour — which is the
/// defect it exists to close (`format: date` on a datetime field re-typed
/// the value instead of reaching the pack's own `datetimeFormats.date`).
///
/// Non-dated types are always false: a number's `format: currency` is a
/// type override and stays one.
pub(super) fn declares(
    name: &str,
    field_type: FieldType,
    ctx: &FormatContext,
    pack: &LangPack,
) -> bool {
    if !matches!(field_type, FieldType::Date | FieldType::Datetime) {
        return false;
    }
    if ctx.named.is_some_and(|m| m.contains_key(name)) {
        return true;
    }
    let (tables, _) = tables(field_type, pack);
    tables.iter().flatten().any(|m| m.contains_key(name))
}

/// Renders a date/datetime through the pick: an inline pattern renders
/// directly; a name looks up the `formats:` registry then the pack tables
/// in order; an unknown name degrades to the default with a warning.
pub(super) fn render(
    pick: Option<Pick>,
    odt: &OffsetDateTime,
    ctx: &FormatContext,
    pack: &LangPack,
    field_type: FieldType,
) -> Formatted {
    let (tables, engine_default) = tables(field_type, pack);
    // Eager lookups (cheap map gets): late-bound `||` thunks here become
    // per-binary uncovered instantiations under the 100% coverage gate.
    let default_pattern = tables
        .iter()
        .flatten()
        .find_map(|m| m.get("default"))
        .map(String::as_str)
        .unwrap_or(engine_default);
    let (pattern, warning) = match &pick {
        Some(Pick::Pattern(p)) => (*p, None),
        Some(Pick::Name(name)) => {
            // A match, not `.map(...)`: a consumer whose registry lookup
            // always misses would leave the `.map` closure instantiation
            // at 0 under the per-binary 100% coverage gate.
            #[allow(clippy::manual_map)]
            let named = match ctx.named.and_then(|m| m.get(*name)) {
                Some(n) => Some(n.pattern.as_str()),
                None => None,
            };
            let from_pack = tables
                .iter()
                .flatten()
                .find_map(|m| m.get(*name))
                .map(String::as_str);
            match named.or(from_pack) {
                Some(p) => (p, None),
                None if *name == "default" => (default_pattern, None),
                None => (
                    default_pattern,
                    Some(FormatWarning::UnknownVariant(money::clip(name))),
                ),
            }
        }
        None => (default_pattern, None),
    };
    Formatted {
        text: render_datetime_pattern(pattern, odt, pack),
        warning,
    }
}
