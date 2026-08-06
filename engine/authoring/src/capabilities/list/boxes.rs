//! Capability keys — the box model, page geometry, and length units.
//!
//! Box/page placement and the length-unit surface every `Length`
//! accepts.
//!
//! One slice of the `CAPABILITIES` registry (composed in `super`);
//! keys stay in append-only wire order — never reorder or remove one.

pub(super) const KEYS: &[&str] = &[
    // Box model.
    "box.margin",
    "box.padding",
    "box.percent",
    // Phase-2 flex: box.type/direction/gap/alignItems/justifyContent.
    "box.flex",
    // Phase-3 static grid: box.type: grid + columns/rows/columnGap/rowGap.
    "box.grid",
    // Grid track lists take `fr` weights (`columns: ["1fr", "2fr", 90]`):
    // leftover distributes across the weights like flexGrow. Older
    // engines parse-reject `fr` (not a Length). `fr` rows need a definite
    // height (auto-height degrades with `grid_fr_no_basis`).
    "grid.fr",
    // box.minWidth/maxWidth/minHeight/maxHeight (CSS-order clamp).
    "box.minmax",
    // box.flexGrow — weighted leftover split among unsized row children.
    "box.flexGrow",
    // alignItems: baseline — row children align on first-text baselines
    // (no-text children synthesize from their bottom edge). Value-enum
    // widening: older engines parse-reject `baseline`.
    "box.alignItems.baseline",
    // Image `fit` gained `cover` (fill+crop) and `none` (intrinsic
    // size); both clip the overflow to the content box.
    "image.fit.cover_none",
    // SVG linear/radial gradient fills (stops, gradientUnits/transform,
    // spreadMethod, href stop inheritance); older engines warn
    // `svg_unsupported` and leave the shape unpainted.
    "image.svg.gradient",
    // `image` items work inside repeat/repeat_flow cells: a static `src:`
    // is shared, a `data:` binding is element-scoped
    // (`dyn:<array>[<i>].<key>`). Older engines warn+skip there.
    "image.cells",
    // `opacity` on an image applies a whole-image (group) paint alpha in
    // both backends; older engines ignore the style key on images.
    "image.opacity",
    // `auto` margin sides (flex free-space absorption).
    "margin.auto",
    // page.margin is the coordinate origin (EdgeSpec forms + legacy
    // array; absolute items escape into it with negative coordinates).
    "page.margin",
    // The flow body `box` may be omitted (= the whole margin box).
    "flow.box.optional",
    // Named page-size presets beyond A4/Letter — A3/A5, JIS B4/B5,
    // Legal/Tabloid.
    "page.size.presets",
    "length.physical",
    // Font-relative `em`/`rem` length units everywhere a `Length` is
    // accepted (box lengths, edges, gaps, grid tracks, column widths).
    "length.em_rem",
    // fontSize/letterSpacing take length strings (pt/mm/cm/in +
    // em/rem; fontSize also `%` of the inherited size — letterSpacing
    // rejects `%` at parse), and the flow body `gap` is a full Length.
    "style.fontSize.length",
    "style.letterSpacing.length",
    "flow.gap.length",
    // `auto` grid COLUMN tracks (`columns: ["auto", "1fr"]`): the track is
    // as wide as the widest cell placed in it. Older engines parse-reject
    // `auto` (not a Length, not an `fr`), the same gate story as
    // `grid.fr`. `auto` in a ROW list is the implicit auto row and needs
    // no capability of its own.
    "grid.auto",
    // box.flexBasis — `content` (the default: an unsized row child starts
    // at its max-content width) or `0` (the `flex: 1` idiom, where
    // flexGrow divides the whole row).
    //
    // This key gates the ESCAPE HATCH, not the behavior. The default
    // changed with it, so a consumer cannot use this key to learn which
    // sizing an engine applied — an older engine given the same wire
    // silently splits the row evenly instead. What the key does tell a
    // consumer is that writing `flexBasis: 0` will be understood.
    "box.flexBasis",
];
