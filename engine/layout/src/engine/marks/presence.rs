//! Form-mark presence: turns a `MarkBinding` into "draw / don't draw"
//! against the current data scope, warning on the two params shapes the
//! predicate cannot use.

use shojiku_core::{resolve_path, BindingScope, MarkBinding};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::predicate::{eval_predicate, PredicateEval};
use super::super::Ctx;

impl Ctx<'_, '_> {
    /// Evaluates a mark binding against the current data scope, warning on
    /// a type mismatch or a non-boolean value. Returns whether to draw.
    ///
    /// `scope: document` reads top-level params even inside a `repeat`
    /// cell — the escape a page-global stamp-on-every-ticket flag needs,
    /// identical to the text [`Binding`](shojiku_core::Binding) key.
    pub(in crate::engine) fn mark_drawn(&mut self, binding: &MarkBinding) -> bool {
        let element = match (&self.scope, binding.scope()) {
            (Some(scope), BindingScope::Element) => Some(&scope.element),
            _ => None,
        };
        let value = match element {
            Some(element) => resolve_path(element, &binding.key).cloned(),
            None => resolve_path(self.input.params, &binding.key).cloned(),
        };
        match eval_predicate(value.as_ref(), binding.equals.as_ref()) {
            PredicateEval::Apply => true,
            PredicateEval::Skip => false,
            PredicateEval::TypeMismatch => {
                self.diags
                    .push(Diagnostic::new(Code::MarkEqualsTypeMismatch).arg("key", &binding.key));
                false
            }
            PredicateEval::NotBool => {
                self.diags
                    .push(Diagnostic::new(Code::MarkValueNotBool).arg("key", &binding.key));
                false
            }
        }
    }
}
