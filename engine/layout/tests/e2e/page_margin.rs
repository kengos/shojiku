//! PM1 `page.margin`: the margin box as the coordinate origin
//! (`src/engine.rs` page assembly + `src/engine/resolve.rs`
//! `resolve_page_margin`). Split by concern: `origin` (the shift across
//! walks), `flow` (the margin-box flow region), `guards` (hostile
//! margins and the clamp diagnostics).

mod flow;
mod guards;
mod origin;
