//! Validation of named binding declarations (`bindings:`): the key each
//! declaration points at, whether its name can be referenced at all,
//! whether anything uses it, and the charset scan that catches the
//! `{品名}` mistake a declaration is the fix for.

mod charset;
mod hostile;
mod keys;
mod usage;

use super::*;

/// Definitions with a non-ASCII scalar (`品名`) beside the shared ones —
/// the key a declaration exists to make reachable — plus a `store` scalar
/// whose name a cell declaration can shadow.
pub(super) fn jdefs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  store:
    type: string
  品名:
    type: string
  total:
    type: number
    format: currency
    displayFormats:
      - id: default
  rows:
    type: array
    items:
      type: object
      properties:
        name:
          type: string
        store:
          type: string
"#,
    )
    .expect("jdefs")
}

/// Every diagnostic carrying `code`.
pub(super) fn find<'d>(
    diags: &'d Diagnostics,
    code: &str,
) -> Vec<&'d shojiku_diagnostics::Diagnostic> {
    diags.items.iter().filter(|d| d.code == code).collect()
}

/// A `repeat` whose cell holds `items`, bound to the `rows` group.
pub(super) fn in_cell(items: &str) -> Template {
    tpl(&format!(
        r#"      - type: repeat
        data: {{ key: rows }}
        grid: {{ columns: 2, rows: 2 }}
        cell:
          items:
{items}
"#
    ))
}
