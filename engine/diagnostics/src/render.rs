//! Single-pass message-template substitution.
//!
//! A code's English template holds `{name}` placeholders; [`render`] fills
//! each from the diagnostic's args. Substitution is **single-pass**: an
//! argument value that itself contains `{...}` is copied verbatim, never
//! re-scanned, so a hostile params value cannot inject a placeholder that
//! expands to more content. A placeholder with no matching arg is left
//! literal (`{name}`) — a visible authoring bug the 100% code-coverage
//! tests surface, not a silent drop.

use crate::arg::ArgValue;
use std::collections::BTreeMap;

/// Fills `{name}` placeholders in `template` from `args`, in one forward
/// pass over the template.
pub(crate) fn render(template: &str, args: &BTreeMap<String, ArgValue>) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) => {
                let key = &after[..close];
                match args.get(key) {
                    Some(value) => out.push_str(&value.render()),
                    None => {
                        out.push('{');
                        out.push_str(key);
                        out.push('}');
                    }
                }
                rest = &after[close + 1..];
            }
            None => {
                // Unterminated `{` — emit the remainder verbatim.
                out.push_str(&rest[open..]);
                return out;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
#[path = "render/tests.rs"]
mod tests;
