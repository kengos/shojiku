//! Parsing + validation of the three source strings. A structural parse
//! failure is surfaced as a single `parse_error` / `non_finite_number`
//! diagnostic by [`validate_strings`] (so a GUI renders it inline like any
//! other), while the render-path [`load_sources`] hard-errors on unparsable
//! input (there is no document to lay out).

use serde_json::Value;
use shojiku_core::{
    parse_definitions, parse_params, parse_template, validate, Catalog, CoreError, Template,
};
use shojiku_diagnostics::Diagnostics;

/// Parsed + validated inputs ready for [`prepare`](crate::prepare). `params`
/// is required (the render path always has params); the validation
/// diagnostics are gated at prepare time.
pub struct Sources {
    pub catalog: Option<Catalog>,
    pub template: Template,
    pub params: Value,
    pub validation: Diagnostics,
}

/// Parses the source strings and runs validation. A parse failure in any
/// input is a hard error — there is no document to render without a template.
pub fn load_sources(
    definitions: Option<&str>,
    template: &str,
    params: &str,
) -> Result<Sources, CoreError> {
    let defs = definitions.map(parse_definitions).transpose()?;
    let template = parse_template(template)?;
    let params = parse_params(params)?;
    let validation = validate(defs.as_ref(), &template, Some(&params));
    Ok(Sources {
        catalog: defs.as_ref().map(Catalog::from_definitions),
        template,
        params,
        validation,
    })
}

/// The `validate` operation: parse errors surface as a single diagnostic
/// instead of an error, and `definitions`/`params` are optional. This is the
/// GUI-facing path where a malformed key must render inline, not abort.
pub fn validate_strings(
    definitions: Option<&str>,
    template: &str,
    params: Option<&str>,
) -> Diagnostics {
    let defs = match definitions.map(parse_definitions).transpose() {
        Ok(d) => d,
        Err(err) => return one_parse_diag(&err),
    };
    let template = match parse_template(template) {
        Ok(t) => t,
        Err(err) => return one_parse_diag(&err),
    };
    let params = match params.map(parse_params).transpose() {
        Ok(p) => p,
        Err(err) => return one_parse_diag(&err),
    };
    validate(defs.as_ref(), &template, params.as_ref())
}

/// Wraps a parse failure as a one-item diagnostics list.
fn one_parse_diag(err: &CoreError) -> Diagnostics {
    let mut diags = Diagnostics::new();
    diags.push(err.to_diagnostic());
    diags
}

#[cfg(test)]
mod tests;
