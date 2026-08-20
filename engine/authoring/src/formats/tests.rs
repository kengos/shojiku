//! Format-catalog tests.
//!
//! The load-bearing ones are not the goldens: they are the checks that the
//! catalog describes the ACCEPTED set rather than the parseable one (a
//! description derived from a wire type errs WIDE, which is the harmful
//! direction), and that each exemplar actually discriminates the variants
//! it is shown to explain.

use super::*;
use shojiku_core::parse_template;
use shojiku_formatter::LangPack;

fn ja() -> LangPack {
    LangPack::builtin("ja-JP", None)
        .expect("parse builtin ja-JP")
        .expect("builtin ja-JP exists")
}

/// The smallest template that PARSES: `Sections.body` is a required field,
/// so `sections: {}` is a parse error and every fixture needs a body.
const BODY: &str = "sections:\n  body:\n    type: flow\n    items: []\n";

/// A template carrying `prefix` (the `defaults:` / `formats:` blocks a test
/// is really about) over the minimal body.
fn template(prefix: &str) -> Template {
    parse_template(&format!("{prefix}{BODY}")).expect("parse")
}

fn empty_template() -> Template {
    template("")
}

fn catalog(template: &Template) -> FormatCatalog {
    format_catalog(Some(template), &ja(), &[])
}

fn entry<'a>(cat: &'a FormatCatalog, field_type: &str) -> &'a FormatTypeEntry {
    cat.types
        .iter()
        .find(|t| t.field_type == field_type)
        .expect("type present")
}

fn sample_for(cat: &FormatCatalog, field_type: &str, spelling: &str) -> String {
    entry(cat, field_type)
        .variants
        .iter()
        .find(|v| v.spelling == spelling)
        .unwrap_or_else(|| panic!("variant `{spelling}` present on `{field_type}`"))
        .samples
        .join(" / ")
}

mod accepted;
mod exemplars;
mod goldens;
mod probes;
mod registry;
mod validate_drift;
