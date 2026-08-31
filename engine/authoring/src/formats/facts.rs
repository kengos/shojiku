//! What a document's `defaults.locale` / `defaults.currency` pick actually
//! DOES, as the engine's own rendered output.
//!
//! The sibling of the format catalog and the same rule: an editor never
//! formats. A locale panel that explains a pick by example used to carry a
//! per-locale table of literal sample strings, copied from the packs and
//! pinned to them by a drift-guard test; every value here is produced by
//! [`shojiku_formatter`] through the SAME dispatch a bare binding takes, so
//! a sample cannot drift from what the page will show.
//!
//! Samples render at **no variant** (`None`), which is what an unadorned
//! `{key}` binding resolves — not at the `default` spelling the catalog
//! lists. The two agree today and a test says so; this one is the honest
//! question to ask of a locale, since a reader picking a locale has not
//! picked a variant.
//!
//! It is a function of (pack, document) alone, so a host answers it for a
//! locale it is not rendering through: the Designer's locale panel explains
//! the tag the DOCUMENT declares, which is deliberately not the tag the
//! preview is running.

use super::exemplar;
use super::variants;
use serde::Serialize;
use serde_json::json;
use shojiku_core::{FieldType, Template};
use shojiku_formatter::{FormatContext, LangPack};

/// What one locale does to the three value kinds a reader recognises.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleFacts {
    /// The resolved pack's OWN id, verbatim — the canonical spelling of what
    /// was actually loaded, which a caller's requested tag need not be: a
    /// bare language resolves to its builtin (`ja` → `ja-JP`), and a caller
    /// that substitutes a tag before asking gets the tag it sent. The engine
    /// aliases nothing else — a REGIONAL tag it holds no pack for is
    /// refused, not widened to its language.
    pub id: String,
    /// The dated exemplar through this locale's default date rendering.
    pub date: String,
    /// The number exemplar. Long enough to show the GROUPING RULE and not
    /// merely the separator — the Indian sizes and the uniform threes are
    /// what a reader is choosing between.
    pub number: String,
    /// `currencyDefault` — the ISO code an amount takes when the document
    /// names none. EMPTY when the pack declares none: a fact the caller
    /// reports or suppresses, never one the engine invents.
    pub currency_default: String,
    /// The currency exemplar at the document's `defaults.currency`, or at
    /// the pack's own default when the document names none.
    ///
    /// It renders through the document's OWN chain, so it shows what THIS
    /// document does. With nothing declared that is the bare grouped amount
    /// at the currency's fraction digits — a zero-decimal currency is
    /// visibly shorter than a two-decimal one — because `symbol` and `name`
    /// are variants a placement picks per field. A document naming one as
    /// its per-type default (`defaults.formats.currency: symbol`) gets THAT
    /// instead, which is the honest answer: it is what the page will print.
    pub amount: String,
}

/// Builds the facts for one (template, locale) pair.
///
/// Pure over its inputs, like [`format_catalog`](super::format_catalog), and
/// `template` is OPTIONAL for the same reason: a live editor's document is
/// unparseable for much of the time somebody is typing in it, and a panel
/// that empties out then is worse than one still describing the locale.
/// Without a document the amount takes the pack's own default currency.
pub fn locale_facts(template: Option<&Template>, pack: &LangPack) -> LocaleFacts {
    let ctx = FormatContext {
        defaults: template.and_then(|t| t.defaults.formats.as_ref()),
        named: template.map(|t| &t.formats),
        currency: template.and_then(|t| t.defaults.currency.as_deref()),
    };
    LocaleFacts {
        id: pack.id.clone(),
        date: variants::render_one(&json!(exemplar::DATED), FieldType::Date, None, pack, &ctx),
        number: variants::render_one(
            &json!(exemplar::NUMBER),
            FieldType::Number,
            None,
            pack,
            &ctx,
        ),
        currency_default: pack.currency_default.clone().unwrap_or_default(),
        amount: variants::render_one(
            &json!(exemplar::CURRENCY),
            FieldType::Currency,
            None,
            pack,
            &ctx,
        ),
    }
}
