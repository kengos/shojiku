//! Per-row conditional style layers: which `row.conditionalStyles`
//! entries a body row's own element selects, and the layers they add on
//! top of the base/zebra row style.
//!
//! The predicate is the shared `{ key, equals? }` one (`super::super::
//! super::predicate`), read RELATIVE to the row element exactly like a
//! column's `data:` binding — so the wire carries no row-selector
//! grammar of its own.

use crate::style::ComputedStyle;
use serde_json::Value;
use shojiku_core::{
    resolve_path, RowConditionalStyle, RowSpec, MAX_ROW_CONDITIONAL_STYLES, MAX_STYLE_NAMES,
};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::super::predicate::{eval_predicate, PredicateEval};
use super::super::super::Ctx;

impl Ctx<'_, '_> {
    /// Overlays every matching conditional entry onto `computed`, in
    /// listed order — so a later entry wins over an earlier one, and any
    /// entry wins over the zebra layer already folded in. Entries past
    /// the cap are ignored here (validate warns about them). Takes and
    /// returns the style by value, like [`ComputedStyle::overlaid`].
    pub(super) fn apply_row_conditions(
        &mut self,
        spec: &RowSpec,
        row: &Value,
        mut computed: ComputedStyle,
    ) -> ComputedStyle {
        for (index, entry) in spec
            .conditional_styles
            .iter()
            .enumerate()
            .take(MAX_ROW_CONDITIONAL_STYLES)
        {
            if !self.row_condition_matches(entry, row, index) {
                continue;
            }
            for name in entry.style_names.iter().take(MAX_STYLE_NAMES) {
                if let Some(style) = self.input.template.styles.get(name) {
                    computed = computed.overlaid(style);
                }
            }
            computed = computed.overlaid(&entry.style);
        }
        computed
    }

    /// Whether one entry's `when` holds for this row. A missing key or an
    /// ordinary non-match is silent (the blank-form params case); a value
    /// the author's literal cannot ever match warns.
    fn row_condition_matches(
        &mut self,
        entry: &RowConditionalStyle,
        row: &Value,
        index: usize,
    ) -> bool {
        let value = resolve_path(row, &entry.when.key);
        let code = match eval_predicate(value, entry.when.equals.as_ref()) {
            PredicateEval::Apply => return true,
            PredicateEval::Skip => return false,
            PredicateEval::TypeMismatch => Code::RowConditionTypeMismatch,
            PredicateEval::NotBool => Code::RowConditionValueNotBool,
        };
        let path = format!("{}.row.conditionalStyles[{index}]", self.current_path());
        // Once per (entry, code): the row array's length is params-driven,
        // and this runs for every row of it.
        if self
            .warned_row_conditions
            .insert(format!("{}:{path}", code.as_str()))
        {
            self.diags.push(
                Diagnostic::new(code)
                    .arg("key", entry.when.key.as_str())
                    .with_path(path),
            );
        }
        false
    }
}
