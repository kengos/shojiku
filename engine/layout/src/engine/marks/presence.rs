//! Form-mark presence: turns a `MarkBinding` into "draw / don't draw"
//! against the current data scope, warning on the two params shapes the
//! predicate cannot use.

use shojiku_core::{resolve_path, BindingScope, EqualsValue, MarkBinding};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::predicate::{eval_predicate, PredicateEval};
use super::super::Ctx;

impl Ctx<'_, '_> {
    /// Resolves a `{ key, equals? }` presence binding against the current
    /// data scope and returns the raw verdict, leaving the caller to map
    /// the two fault arms onto ITS OWN diagnostic codes.
    ///
    /// `scope: document` reads top-level params even inside a `repeat`
    /// cell — the escape a page-global stamp-on-every-ticket flag needs,
    /// identical to the text [`Binding`](shojiku_core::Binding) key.
    ///
    /// Shared by form marks and an item's `visible:` so the two cannot
    /// drift: one scope rule, one truth table
    /// ([`eval_predicate`](super::super::predicate::eval_predicate)), two
    /// vocabularies of diagnostic on top.
    pub(in crate::engine) fn eval_presence(
        &mut self,
        key: &str,
        equals: Option<&EqualsValue>,
        scope: BindingScope,
    ) -> PredicateEval {
        let element = match (&self.scope, scope) {
            (Some(scope), BindingScope::Element) => Some(&scope.element),
            _ => None,
        };
        let value = match element {
            Some(element) => resolve_path(element, key).cloned(),
            None => resolve_path(self.input.params, key).cloned(),
        };
        eval_predicate(value.as_ref(), equals)
    }

    /// Evaluates a mark binding against the current data scope, warning on
    /// a type mismatch or a non-boolean value. Returns whether to draw.
    pub(in crate::engine) fn mark_drawn(&mut self, binding: &MarkBinding) -> bool {
        match self.eval_presence(&binding.key, binding.equals.as_ref(), binding.scope()) {
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
