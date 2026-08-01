//! Form marks end to end (`src/engine/marks.rs` + the shared
//! `src/engine/predicate.rs`):
//! presence (`presence`), the params predicate and warnings
//! (`predicate`), and geometry / scope / hostile-input guards
//! (`guards`).

/// A body wrapping the given items in a flow section (absolute placement:
/// each item carries its own `box.x`/`box.y`).
pub(super) fn flow(items: &str) -> String {
    format!(
        r#"
page: {{ size: A4 }}
sections:
  body:
    type: flow
    items:
{items}
"#
    )
}

mod auto_size;
mod guards;
mod placement;
mod predicate;
mod presence;
mod text_mark;
