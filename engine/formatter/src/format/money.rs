//! Currency and quantity rendering: the three currency
//! variants (`default` = bare amount, `symbol`, `name`), the CLDR
//! fractions precision chain, and semantic-unit quantities with plural
//! words from the pack.

use super::{format_number, FormatWarning, Formatted, Pick};
use crate::lang::{currency_fraction_digits, LangPack};
use shojiku_core::FieldSpec;

/// Truncates a caller-supplied name before it is echoed into a warning —
/// variant/unit/currency names arrive from untrusted templates.
pub(super) fn clip(name: &str) -> String {
    const MAX_CHARS: usize = 32;
    if name.chars().count() <= MAX_CHARS {
        name.to_string()
    } else {
        let head: String = name.chars().take(MAX_CHARS).collect();
        format!("{head}…")
    }
}

/// Renders a currency amount per the picked variant. The code resolves
/// through the defaults chain: `Field.currency` ← the document
/// `defaults.currency` (`doc_currency`) ← the pack's `currencyDefault` ←
/// `JPY`. Precision: `Field.precision` override ← the pack's per-code
/// override ← the CLDR fractions table (so an unlisted code still keeps
/// its cents). The `default` variant is the bare grouped amount —
/// symbol/name forms are explicit picks, composing cleanly with template
/// literals.
pub(super) fn format_currency(
    amount: f64,
    spec: Option<&FieldSpec>,
    doc_currency: Option<&str>,
    pick: Option<Pick>,
    pack: &LangPack,
) -> Formatted {
    let code = spec
        .and_then(|s| s.currency.as_deref())
        .or(doc_currency)
        .or(pack.currency_default.as_deref())
        .unwrap_or("JPY");
    let display = pack.currency.get(code);
    let precision = spec
        .and_then(|s| s.precision)
        .or_else(|| display.and_then(|c| c.precision))
        .unwrap_or_else(|| currency_fraction_digits(code));

    let negative = amount < 0.0;
    let digits = format_number(amount.abs(), Some(precision), pack);

    let (variant, mut warning) = match pick {
        None => ("default", None),
        Some(Pick::Name(n)) => (n, None),
        Some(Pick::Pattern(_)) => ("default", Some(FormatWarning::IgnoredPattern)),
    };
    let body = match variant {
        "default" => digits.clone(),
        "symbol" => {
            let (symbol, layout) = match display {
                Some(c) => (c.symbol.clone(), c.symbol_format.as_str()),
                // No display data: the code itself is the only honest
                // symbol; precision stayed correct via the fractions
                // table above.
                None => {
                    warning = warning.or(Some(FormatWarning::UnknownCurrency(clip(code))));
                    (format!("{code} "), "{symbol}{amount}")
                }
            };
            layout
                .replace("{symbol}", &symbol)
                .replace("{amount}", &digits)
        }
        "name" => match display.and_then(|c| c.name.clone()) {
            Some(name) => {
                let layout = display
                    .map(|c| c.name_format.as_str())
                    .unwrap_or("{amount} {name}");
                layout.replace("{name}", &name).replace("{amount}", &digits)
            }
            None => {
                warning = warning.or(Some(FormatWarning::UnknownCurrency(clip(code))));
                format!("{digits} {code}")
            }
        },
        other => {
            warning = warning.or(Some(FormatWarning::UnknownVariant(clip(other))));
            digits.clone()
        }
    };
    Formatted {
        text: if negative { format!("-{body}") } else { body },
        warning,
    }
}

/// Renders a quantity through its semantic unit key: the pack supplies
/// the (plural-aware) unit word and the layout (`"{amount}{unit}"` ja /
/// `"{amount} {unit}"` en). An unknown key renders verbatim as the unit
/// with a warning — visible, never a failure.
pub(super) fn format_quantity(amount: f64, spec: Option<&FieldSpec>, pack: &LangPack) -> Formatted {
    let key = spec.and_then(|s| s.unit.as_deref()).unwrap_or("item");
    let digits = format_number(amount, None, pack);
    match pack.unit(key) {
        Some(unit) => {
            let layout = unit.format.as_deref().unwrap_or(&pack.unit_format);
            Formatted {
                text: layout
                    .replace("{amount}", &digits)
                    .replace("{unit}", unit.word(amount)),
                warning: None,
            }
        }
        None => Formatted {
            text: pack
                .unit_format
                .replace("{amount}", &digits)
                .replace("{unit}", key),
            warning: Some(FormatWarning::UnknownUnit(clip(key))),
        },
    }
}
