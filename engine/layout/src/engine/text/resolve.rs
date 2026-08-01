//! Binding resolution: the ONE place a bound params value becomes a
//! display string. Every text-bearing item routes through here (text
//! `data:`/interpolation, spans, `qr_code`, `char_grid`, table columns,
//! list entries), so the blank-form `placeholder` and the formatter's
//! degradation warnings are decided once, not per item kind.

use serde_json::Value;
use shojiku_core::{is_blank, resolve_path, BindingScope, Bindings, FieldSpec, Segment};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_formatter::format_value;

use crate::engine::Ctx;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Resolves `text:`/`data:` content shared by text and `qr_code`
    /// items: a data binding, or interpolated static text, resolved
    /// against the current data scope (a `repeat` cell's element, else
    /// top-level params) unless the binding authors `scope: document`.
    /// `None` when neither is authored — the caller owns the
    /// item-specific diagnostic. `bindings` is the OWNING item's
    /// declaration map: an interpolation segment naming one of its
    /// entries resolves through that declaration (which is how a
    /// `{name}` gains a scope, a placeholder, or a non-ASCII key);
    /// every other segment reads the ambient scope, exactly as before.
    pub(in crate::engine) fn resolve_content(
        &mut self,
        text: Option<&str>,
        data: Option<&shojiku_core::Binding>,
        bindings: &Bindings,
    ) -> Option<String> {
        // Cloning the `Rc`/key is cheap and releases the borrow on `self`.
        let scope = self.scope.clone();
        let (row, array_key) = match &scope {
            Some(s) => (Some(s.element.as_ref()), Some(s.array_key.as_str())),
            None => (None, None),
        };
        if let Some(binding) = data {
            // `scope: document` is the explicit escape out of the element
            // scope: the key is read from top-level params even inside a
            // cell (a store name printed on every ticket). Outside a cell
            // there is nothing to escape, so it is inert.
            let (row, array_key) = match binding.scope() {
                BindingScope::Document => (None, None),
                BindingScope::Element => (row, array_key),
            };
            return Some(self.resolve_binding(
                &binding.key,
                binding.format.as_deref(),
                binding.placeholder.as_deref(),
                row,
                array_key,
            ));
        }
        let content = text?;
        let mut out = String::new();
        for segment in shojiku_core::parse_segments(content) {
            match segment {
                Segment::Literal(s) => out.push_str(&s),
                Segment::Expr { key, format } => {
                    let text =
                        self.resolve_segment(&key, format.as_deref(), bindings, (row, array_key));
                    out.push_str(&text);
                }
            }
        }
        Some(out)
    }

    /// One `{name}` / `{name:format}` segment.
    ///
    /// A DECLARED name resolves through its declaration — its own key
    /// (which may be outside the reference charset), its scope, its
    /// placeholder — with an inline `:format` overriding the
    /// declaration's, most-specific-wins like the style cascade. An
    /// UNDECLARED name keeps the original meaning: the name IS the key,
    /// read at the ambient scope, and carries no placeholder of its own
    /// (the grammar stays two-part), so the field's covers it.
    fn resolve_segment(
        &mut self,
        name: &str,
        format: Option<&str>,
        bindings: &Bindings,
        ambient: (Option<&Value>, Option<&str>),
    ) -> String {
        let (row, array_key) = ambient;
        let Some(decl) = bindings.get(name) else {
            return self.resolve_binding(name, format, None, row, array_key);
        };
        // `scope: document` escapes the element scope for this segment
        // alone — the whole point of declaring it inside a cell.
        let (row, array_key) = match decl.scope() {
            BindingScope::Document => (None, None),
            BindingScope::Element => (row, array_key),
        };
        self.resolve_binding(
            &decl.key,
            format.or(decl.format.as_deref()),
            decl.placeholder.as_deref(),
            row,
            array_key,
        )
    }

    /// Resolves one bound value to its formatted display string.
    ///
    /// A blank value (absent / `null` / `""`) covered by a `placeholder` —
    /// the placement's, else the field's — draws that placeholder verbatim
    /// and reports nothing: it is the author's "intentionally blank" signal.
    /// A value that is PRESENT but unusable still reports `format_error`, so
    /// a data bug never hides behind a blank-form placeholder.
    pub(in crate::engine) fn resolve_binding(
        &mut self,
        key: &str,
        format: Option<&str>,
        placeholder: Option<&str>,
        row: Option<&Value>,
        array_key: Option<&str>,
    ) -> String {
        let (value, spec): (Option<&Value>, Option<&FieldSpec>) = match (row, array_key) {
            (Some(row), Some(array_key)) => (
                resolve_path(row, key),
                self.input
                    .catalog
                    .and_then(|c| c.array_field(array_key, key)),
            ),
            _ => (
                resolve_path(self.input.params, key),
                self.input.catalog.and_then(|c| c.scalar(key)),
            ),
        };

        if is_blank(value) {
            if let Some(text) = placeholder.or(spec.and_then(|s| s.placeholder.as_deref())) {
                return text.to_string();
            }
        }

        let Some(value) = value else {
            self.diags.push(
                Diagnostic::new(Code::MissingData)
                    .arg("scope", "")
                    .arg("key", key),
            );
            return String::new();
        };

        let ctx = shojiku_formatter::FormatContext {
            defaults: self.input.template.defaults.formats.as_ref(),
            named: Some(&self.input.template.formats),
            currency: self.input.template.defaults.currency.as_deref(),
        };
        match format_value(value, spec, format, ctx, self.input.pack) {
            Ok(formatted) => {
                if let Some(warning) = formatted.warning {
                    // Deduped: a 500-row table must not repeat the same
                    // degradation notice per cell.
                    self.warn_format_once(key, &warning);
                }
                formatted.text
            }
            Err(err) => {
                self.diags.push(
                    Diagnostic::new(Code::FormatError)
                        .arg("key", key)
                        .arg("detail", err.to_string()),
                );
                match value {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                }
            }
        }
    }

    /// Emits a formatter degradation warning once per `(key, message)` —
    /// the value already rendered on its fallback form, so this is
    /// advice, not an error (degrade, don't fail, but say so).
    fn warn_format_once(&mut self, key: &str, warning: &shojiku_formatter::FormatWarning) {
        use shojiku_formatter::FormatWarning as W;
        let code = match warning {
            W::UnknownVariant(_) => Code::UnknownFormatVariant,
            W::UnknownCurrency(_) => Code::UnknownCurrency,
            W::UnknownUnit(_) => Code::UnknownUnit,
            W::IgnoredPattern => Code::FormatPatternIgnored,
        };
        if self
            .warned_formats
            .insert(format!("{}:{key}", code.as_str()))
        {
            // The pattern-ignored template names only the key; the others
            // carry the formatter's degradation detail.
            let diag = match warning {
                W::IgnoredPattern => Diagnostic::new(code).arg("key", key),
                other => Diagnostic::new(code)
                    .arg("key", key)
                    .arg("detail", other.to_string()),
            };
            self.diags.push(diag);
        }
    }
}
