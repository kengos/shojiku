//! List items (N2): a bounded per-element list — one line per array
//! entry, clamped at the last fitting entry with a count-aware overflow
//! line (`他{count}件`). No pagination: inside a `repeat` cell the box is
//! a fixed slot; an auto-height list simply grows. Entries wider than
//! the box take a per-entry ellipsis (the T1 clamp).

use crate::font::{run_width, RunOptions};
use crate::tree::{LayoutItem, TextBlock, TextLine};
use serde_json::Value;
use shojiku_core::{
    resolve_path, BindingScope, FontStyle, FontWeight, ListItem, TextAlign, TextSpacingTrim,
};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

mod vertical;

use super::text::clamp_line;
use super::{placed_box, with_vertical_margin, Atom, Basis, Ctx};

/// The two identities of the array a list binds, threaded to each entry.
/// They differ only for a NESTED source, and conflating them is exactly
/// the bug this split exists to prevent.
pub(super) struct EntryKeys<'a> {
    /// As AUTHORED — row-relative inside a cell. The asset identity.
    pub array_key: &'a str,
    /// The definitions catalog's full dotted path. Field specs only.
    pub catalog_key: &'a str,
}

/// Cap on rendered entries. Params are untrusted and a hostile array
/// would otherwise drive unbounded measurement; entries past the cap are
/// never rendered but still count into the overflow line's `{count}`.
pub(super) const MAX_LIST_ENTRIES: usize = 1000;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a list atom. The array resolves scope-aware: inside a
    /// `repeat` cell `data.key` is a field of the bound element, at the
    /// top level a params key — and `scope: document` escapes to the
    /// top level from inside a cell, like any other binding.
    /// `verticalAlign` is not applied (entries stack from the top; a
    /// clamped list has no slack by construction).
    pub(super) fn list_atom(&mut self, list: &ListItem, basis: &Basis) -> Option<Atom> {
        let b = list.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let key = &list.data.key;
        let scope = match list.data.scope() {
            BindingScope::Document => None,
            BindingScope::Element => self.scope.clone(),
        };
        let value = match &scope {
            Some(s) => resolve_path(&s.element, key),
            None => resolve_path(self.input.params, key),
        };
        let entries: Vec<Value> = match value {
            None => {
                self.diags.push(
                    Diagnostic::new(Code::MissingData)
                        .arg("scope", "list data ")
                        .arg("key", key.as_str()),
                );
                return None;
            }
            Some(Value::Array(rows)) => rows.clone(),
            Some(_) => {
                self.diags
                    .push(Diagnostic::new(Code::NotAnArray).arg("key", key.as_str()));
                return None;
            }
        };

        // The entries' catalog identity: a row-relative key joins the
        // enclosing scope's path (`orders` + `items`), so a nested list's
        // per-entry fields carry their declared formats exactly as a
        // top-level list's do. `scope: document` escapes to the top level,
        // so it joins nothing.
        let parent = scope.as_ref().map(|s| s.catalog_key.as_str());
        let catalog_key = self
            .input
            .catalog
            .and_then(|c| c.resolve_array_path(parent, key))
            .unwrap_or_else(|| key.clone());

        let keys = EntryKeys {
            array_key: key,
            catalog_key: &catalog_key,
        };

        let computed = self.resolve_style(&list.style_names, &list.style);
        // A vertical writing mode turns the list into right-to-left columns
        // (one per entry); the horizontal path below is the default.
        if computed.writing_mode == shojiku_core::WritingMode::VerticalRl {
            return Some(self.vertical_list_atom(list, rb, w, entries, &computed, &keys));
        }
        let resolved = self.resolved_chain(&computed);
        let font_id = resolved.primary.face.id.clone();
        let size = self.sane_font_size(computed.font_size);
        let line_height = size * self.sane_line_height(computed.line_height);
        let letter_spacing = self.sane_letter_spacing(computed.letter_spacing);
        let content_x = rb.content_x();
        let content_w = rb.content_w(w);

        // How many lines fit: definite h clamps (reserving one line for
        // the overflow text when entries are cut); auto height fits all.
        let total = entries.len();
        let kept = match rb.h_or_fill(basis) {
            Some(h) => {
                let avail = rb.content_h(h).max(0.0);
                // `line_height > 0` (both factors sanity-guarded); the cast
                // saturates and `min(total)` bounds it.
                let n_fit = (avail / line_height).floor() as usize;
                if total <= n_fit {
                    total
                } else {
                    n_fit.saturating_sub(1)
                }
            }
            None => total,
        }
        .min(MAX_LIST_ENTRIES);
        let cut = total - kept;

        let mut texts: Vec<String> = Vec::with_capacity(kept + 1);
        for (index, entry) in entries.iter().take(kept).enumerate() {
            texts.push(self.entry_text(list, entry, &keys, index));
        }
        if cut > 0 {
            let template = list.overflow_text.as_deref().unwrap_or("+{count}");
            texts.push(template.replace("{count}", &cut.to_string()));
        }
        // Per-entry ellipsis (T1 clamp) so an over-wide entry never wraps
        // and never draws past the content box.
        let texts: Vec<String> = texts
            .into_iter()
            .map(|t| clamp_line(&resolved.faces, t, size, letter_spacing, content_w))
            .collect();

        let content_h = texts.len() as f64 * line_height;
        let height = rb.h.unwrap_or(content_h + rb.v_padding());
        let lines: Vec<TextLine> = texts
            .iter()
            .enumerate()
            .map(|(i, text)| {
                let line_w = run_width(
                    &resolved.faces,
                    text,
                    size,
                    RunOptions::spacing_only(letter_spacing),
                );
                let lx = match computed.text_align {
                    TextAlign::Left => content_x,
                    TextAlign::Center => content_x + ((content_w - line_w) / 2.0).max(0.0),
                    TextAlign::Right => content_x + (content_w - line_w).max(0.0),
                };
                TextLine {
                    text: text.clone(),
                    x: lx,
                    y: rb.padding[0] + i as f64 * line_height,
                    width: line_w,
                    runs: Vec::new(),
                }
            })
            .collect();

        // `textDecoration`, resolved like text_block does (same metric
        // source, same line-top-relative offset).
        let decoration =
            super::text::decoration_spec(resolved.primary.face, computed.text_decoration, size);

        let mut items = Vec::with_capacity(2);
        self.push_decoration(&mut items, &computed, rb.x, w, height);
        // One-line so line coverage does not depend on the italic branch.
        let synthetic_bold =
            computed.font_weight == FontWeight::Bold && !resolved.primary.real_bold;
        let synthetic_italic =
            computed.font_style == FontStyle::Italic && !resolved.primary.real_italic;
        items.push(LayoutItem::Text(TextBlock {
            font_id,
            fallback_ids: resolved.fallback_ids,
            font_size: size,
            line_height,
            letter_spacing,
            color: self.color_or_black(computed.color.as_deref()),
            synthetic_bold,
            synthetic_italic,
            decoration,
            opacity: self.sane_opacity(computed.opacity),
            baseline: None,
            // Lists have no `link:` wire (LK1 scope: text/image/span).
            link: None,
            // half-width punctuation is not applied to list entries in v1 (they are short
            // labels; measurement and drawing stay untrimmed together).
            text_spacing_trim: TextSpacingTrim::SpaceAll,
            vertical: None,
            text_combine: None,
            lines,
        }));
        let boxes = vec![placed_box(
            &self.current_path(),
            list.id.as_deref(),
            &rb,
            w,
            height,
        )];
        Some(with_vertical_margin(
            Atom {
                height,
                items,
                boxes,
                rb: Some(rb),
            },
            rb.margin[0],
            rb.margin[2],
        ))
    }

    /// One entry's display string: the `text:` template interpolated
    /// against the entry object (scope push, like a one-element cell), or
    /// the entry value formatted directly when no template is authored.
    fn entry_text(
        &mut self,
        list: &ListItem,
        entry: &Value,
        keys: &EntryKeys<'_>,
        index: usize,
    ) -> String {
        match &list.text {
            Some(template) => {
                let saved = self.scope.take();
                self.scope = Some(super::Scope {
                    element: std::rc::Rc::new(entry.clone()),
                    array_key: keys.array_key.to_string(),
                    catalog_key: keys.catalog_key.to_string(),
                    index,
                });
                // `text` is authored, so `resolve_content` is always `Some`.
                let out = self
                    .resolve_content(Some(template), None, &list.bindings)
                    .unwrap_or_default();
                self.scope = saved;
                out
            }
            None => match entry {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            },
        }
    }
}
