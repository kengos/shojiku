//! Capability keys — item types and item-level features.
//!
//! The template `type:` values plus the per-item features that
//! widen an item's own syntax (marks, char_grid modes, inspect output).
//!
//! One slice of the `CAPABILITIES` registry (composed in `super`);
//! keys stay in append-only wire order — never reorder or remove one.

pub(super) const KEYS: &[&str] = &[
    // Item types (template `type:` values).
    "text",
    "rect",
    "line",
    "image",
    "container",
    "table",
    "repeat",
    // Flow repeat — one auto-height card per array element, stacked
    // in flow with `gap`, paginating card-by-card.
    "repeat_flow",
    "page_number",
    // Layout-time vector QR (works inside repeat cells) and the
    // bounded per-element list with the count-aware overflow clamp.
    "qr_code",
    "list",
    // Explicit flow page break (fresh-page no-op, so breaks collapse).
    "page_break",
    // Form marks — box-inscribed ellipse (circled-text / decoration) and a
    // checkbox (always-drawn frame + params-driven check); presence binds
    // via `data: { key, equals }`, geometry stays template-fixed.
    "ellipse",
    "checkbox",
    // A text-anchored circled-text: `mark: { data, padding?, style }` on a text
    // item overlays a glyph-band oval that auto-centers on the text, so
    // authors no longer hand-measure the offset a font change invalidates.
    "text.mark",
    // Checkbox `box.w`/`box.h` may be omitted — the frame defaults to the
    // inherited font's cap-height square (a label-matched checkbox).
    "checkbox.auto_size",
    // `inspect` emits per-line text metrics (baseline + cap/em band) on
    // every text item's placed box, so a GUI/AI can snap overlays
    // without re-measuring a preview.
    "inspect.text_metrics",
    // `inspect` emits a `PlacedBox` for EVERY laid-out item, id-carrying
    // or not, each addressed by a structural `path` (the validate
    // diagnostic grammar: `sections.body.items[3].items[0]`,
    // `…cell.items[1]`, `…columns[2]`); `id` becomes an optional alias.
    // The GUI canvas hit-tests every item without GUI-side id injection.
    "inspect.boxes.all_items",
    // Fixed character cells (genkoyoshi/kanji workbooks/application-form) — one char
    // per cell, school kinsoku hang-back, vertical_rl, sheet pagination.
    "char_grid",
    // Opt-in aozora ruby markup (`|base《reading》`) on char_grid.
    "char_grid.markup.aozora",
    // Template-authored ruby readings on a text item:
    // `ruby: [{ base, text }]` + optional `rubySize`, drawn beside
    // (vertical) or above (horizontal) each base run — every text
    // surface since `style.textCombineUpright.all` shipped (this key
    // marks the original vertical-plain support). A vertical char_grid
    // also shapes its cells with GSUB `vert` (no new syntax — the same
    // `char_grid` key covers it). Older engines parse-reject the
    // `ruby` key.
    "text.ruby",
    // char_grid placement widened to containers and repeat/repeat_flow
    // cells (one sheet, element-scoped bindings); older engines
    // warn+skip there.
    "char_grid.containers",
    // `repeat` takes `breakBefore: auto` — the imposition grid starts at
    // the flow cursor instead of forcing a fresh page, so a title above
    // the grid no longer costs a page. The first page derives its ROW
    // COUNT from the region left under the cursor; cells keep the same
    // size on every page. Default (`page`) is the unchanged fresh-page
    // behavior; older engines parse-reject the key.
    "repeat.breakBefore",
    // `repeat.grid` takes the CSS `gap` shorthand, with `columnGap` /
    // `rowGap` falling back to it — the same form a `box.type: grid`
    // container already accepts. Negative gaps now clamp to 0 on this
    // grid too (they used to overlap the cells). Older engines
    // parse-reject the key.
    "repeat.grid.gap",
    // `repeat` takes `cutMarks: true` — trim guides drawn just
    // outside the imposition grid at every cut position, so an n-up sheet
    // can be cut without measuring. Ticks reach into the page margin and
    // are clamped to the sheet (`cut_marks_clipped` when a side has no
    // room). Older engines parse-reject the key.
    "repeat.cutMarks",
    // A `data:` binding (and a form mark's) takes `scope: document` — the
    // explicit escape out of the element scope inside a `repeat` cell,
    // `repeat_flow` card, or table `cell:` column, so a page-global value
    // (a store name, a pickup date) reads top-level params. Default `element` is the
    // unchanged ambient scope; older engines parse-reject the key.
    "binding.scope",
    // A table column takes `cell:` instead of `data:` — a per-row
    // sub-template of freely placed items with the CELL's top-left as
    // their origin, scoped to the row element. An auto row is as tall as
    // its tallest cell; a fixed `row.height` clips per the cell's
    // `overflow`. Older engines parse-reject the key.
    "table.column.cell",
    // A `data:` binding (and a `definitions.yml` field) takes a
    // `placeholder:` — verbatim text drawn when the bound value is absent,
    // `null`, or `""`, suppressing the `missing_data`/`format_error` that
    // an intentionally-blank fillable form would otherwise emit. A present
    // but invalid value still reports `format_error`. Older engines
    // parse-reject the key.
    "binding.placeholder",
    // An item takes `bindings:` — a map of interpolation NAME → the full
    // `data:` option set, so a `{name}` inside a mixed line can carry a
    // scope (`scope: document` from inside a cell), a placeholder, a
    // format, or a key outside the reference charset (`{品名}`, which
    // otherwise prints its braces verbatim). An inline `{name:format}`
    // overrides the declaration's format; an UNDECLARED name is unchanged.
    // Carried by text / qr_code / char_grid / list / image (link URL);
    // older engines parse-reject the key.
    "binding.declarations",
    // char_grid honors the ITEM's own `style.textAlign`: `center`/`right`
    // fill a partly filled line toward its END (vertical_rl: downward),
    // so an entry grid (name field) no longer sits at the wrong end. Full
    // lines never move. Older engines parse the key and ignore it.
    "char_grid.textAlign",
    // The aozora `［＃改ページ］` note starts a new char_grid sheet under
    // `markup: aozora`; every other `［＃…］` note renders literally and
    // warns `aozora_note_ignored`. Older engines render notes literally.
    "char_grid.markup.aozora.page_break",
    // The aozora `［＃「対象」は大書き］` note (optionally `はＮ倍の`) draws
    // its target across an n×n block of cells (dialogue/heading emphasis) under
    // `markup: aozora`; the block starts a fresh line and content resumes
    // below it. Older engines render the note literally.
    "char_grid.markup.aozora.large",
    // The aozora placement notes `［＃Ｎ字下げ］` / `［＃地付き］` /
    // `［＃地からＮ字上げ］` / `［＃中央］` (the last a Shojiku extension)
    // position a source line within the grid under `markup: aozora`,
    // overriding the item's `textAlign` for that line. Older engines
    // render the notes literally.
    "char_grid.markup.aozora.placement",
    // `inspect` emits per-COLUMN metrics on a vertical text item's placed
    // box — `text: { columns: [{ y, height, baseline, emLeft, emRight }] }`
    // (the axis-swapped analog of `lines`; `baseline` is the column-axis
    // x). Older engines omit `text` on vertical items entirely.
    "inspect.text_metrics.vertical",
    // A `line`'s `from`/`to` endpoints take full `Length` values, not just
    // bare pt numbers: `to: { x: "100%" }` reaches the right edge of
    // whatever box the line sits in, so an underline under a flex child
    // no longer needs a width nobody can know at authoring time. Older
    // engines reject the string form as a number-typed field.
    "line.length",
];
