//! The `instructions` string returned from `initialize`.
//!
//! MCP clients feed this to the model as server usage guidance, which makes
//! it the only text an agent is guaranteed to see before it starts writing
//! a template. An agent installed the advertised way — `docker pull` plus
//! `claude mcp add` — has no checkout, so it has no `docs/` and no
//! `skills/`; without this it discovers the syntax only through `validate`
//! rejections, which can correct a wrong key inside a construct it already
//! reached but can never tell it that construct exists.
//!
//! Keep it short. It is a signpost to the surfaces that hold the real
//! answers, not a copy of them.

/// Server usage guidance handed to the model at initialize time.
pub(crate) const INSTRUCTIONS: &str = "\
Shojiku renders PDF business documents (invoices, receipts, forms) from a \
template plus data. You author the files; this server validates, renders \
and measures them. It never writes files — that stays yours.

The three-file model:
- definitions.yml — the data schema: what fields exist and their types. \
Optional, but passing it enables schema-aware checks.
- templates.yml — the layout: pages, sections, items, styles. This is the \
file you spend your time on.
- params.json — one document's actual data, matching definitions.yml.

The authoring loop:
1. validate — parse and check; every problem comes back as a diagnostic \
with a stable code, not as prose. Start here and after every edit.
2. render_preview — rasterize to PNG per page, so you can see it.
3. inspect_layout — the resolved geometry: the layout tree and a box per \
item. Use it when something is in the wrong place; do not guess at \
positions from the image.

Start from a working example rather than from scratch. Call list_examples \
for the bundled catalog — each entry says what it exercises — then read one \
with get_example, or via resources/read on its shojiku://example/... URI. \
An entry returns its source files together, because a template cannot be \
understood without the definitions its bindings name. The layout showcase \
entry is the syntax exerciser: most of the authorable surface in one \
document.

On what you think you know: whatever you recall about Shojiku's syntax is \
either absent from your training data or older than this build. The engine \
you are talking to is the authority. Ask capabilities for the feature keys \
this build supports, read the bundled examples for the shapes it accepts, \
and let validate settle any dispute — do not write a key from memory and \
assume it exists.";

#[cfg(test)]
mod tests;
