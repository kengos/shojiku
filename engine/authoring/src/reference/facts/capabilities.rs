//! Which catalog nodes an older engine may not carry, and the capability key
//! that says this one does — so a panel built from the catalog can leave out
//! a field the engine it talks to would refuse.
//!
//! Most pairs follow from the node's name: a `Style.<key>` is gated by
//! `style.<key>`, an item type by its own name, and a few keys every item
//! carries by one key each. The rest are listed in [`NAMED`]. A capability
//! that names behaviour rather than a key (`checkbox.auto_size`,
//! `inspect.boxes`) has no node and is not here.

use crate::CAPABILITIES;
use serde_json::Value;

/// Pairs no naming rule produces.
pub const NAMED: [(&str, &str); 55] = [
    ("Item.ellipse.anchor", "ellipse.anchor"),
    // The anchor FORM of a line endpoint, so its `edge` and `offset` are
    // gated with its `item`.
    ("PointSpec.@item", "line.anchor"),
    ("Item.text.mark", "text.mark"),
    ("Item.text.spans", "text.spans"),
    ("Item.text.ruby", "text.ruby"),
    ("Item.text.rubySize", "text.ruby"),
    ("Item.text.link", "link.url"),
    ("Item.image.link", "link.url"),
    ("Span.link", "link.url"),
    // The stroke PATTERN key; `width` and `color` are older than it.
    ("LineStyle.style", "line.style"),
    ("LineStyle.opacity", "style.opacity"),
    ("Item.char_grid.markup", "char_grid.markup.aozora"),
    ("Item.repeat.breakBefore", "repeat.breakBefore"),
    ("Item.repeat.cutMarks", "repeat.cutMarks"),
    ("GridSpec.gap", "repeat.grid.gap"),
    ("Item.table.box", "table.box"),
    ("Item.table.style", "table.style"),
    ("Item.table.keepTogether", "table.keepTogether"),
    ("Item.table.headerGroups", "table.headerGroups"),
    ("Item.table.mergeEmptyCells", "table.mergeEmptyCells"),
    ("RowSpec.height", "table.row.height"),
    ("RowSpec.conditionalStyles", "table.row.conditionalStyles"),
    (
        "TableHeaderSpec.visuallyHidden",
        "table.header.visuallyHidden",
    ),
    ("Column.cell", "table.column.cell"),
    ("Column.type", "table.column.type"),
    ("Binding.scope", "binding.scope"),
    ("MarkBinding.scope", "binding.scope"),
    ("Binding.placeholder", "binding.placeholder"),
    ("Schema.placeholder", "binding.placeholder"),
    ("TemplateDefaults.locale", "template.defaults.document"),
    ("TemplateDefaults.currency", "template.defaults.document"),
    ("Style.borderWidth", "style.border"),
    ("Style.borderColor", "style.border"),
    ("OptBox.margin", "box.margin"),
    ("OptBox.padding", "box.padding"),
    ("OptBox.type", "box.flex"),
    ("OptBox.gap", "box.flex"),
    ("OptBox.direction", "box.flex"),
    ("OptBox.alignItems", "box.flex"),
    ("OptBox.justifyContent", "box.flex"),
    ("OptBox.columns", "box.grid"),
    ("OptBox.rows", "box.grid"),
    ("OptBox.columnGap", "box.grid"),
    ("OptBox.rowGap", "box.grid"),
    ("LabeledEnumValue", "definitions.enum.labels"),
    // The shapes took the unified `style:` and `styleNames` together; an
    // engine before that spelled a fill `fillColor`.
    ("Item.rect.style", "style.shapes.unified"),
    ("Item.rect.styleNames", "style.shapes.unified"),
    ("Item.ellipse.style", "style.shapes.unified"),
    ("Item.ellipse.styleNames", "style.shapes.unified"),
    ("Item.checkbox.style", "style.shapes.unified"),
    ("Item.checkbox.styleNames", "style.shapes.unified"),
    ("TextMark.style", "style.shapes.unified"),
    ("TextMark.styleNames", "style.shapes.unified"),
    ("OptBox.columnSpan", "grid.span"),
    ("OptBox.rowSpan", "grid.span"),
];

/// Box bounds and flex weights, one capability per family.
const BOX: [(&str, &str); 6] = [
    ("OptBox.minWidth", "box.minmax"),
    ("OptBox.maxWidth", "box.minmax"),
    ("OptBox.minHeight", "box.minmax"),
    ("OptBox.maxHeight", "box.minmax"),
    ("OptBox.flexGrow", "box.flexGrow"),
    ("OptBox.flexBasis", "box.flexBasis"),
];

/// Capabilities with no node of their own, so nothing above gates them. The
/// completeness test holds every declared key to being gated or listed here.
pub const UNGATED: [&str; 84] = [
    // A new VALUE or spelling of a key that already exists: the node is
    // older than the capability.
    "box.percent",
    "box.alignItems.baseline",
    "grid.fr",
    "grid.auto",
    "margin.auto",
    "image.fit.cover_none",
    "image.svg.gradient",
    "page.size.presets",
    "length.physical",
    "length.em_rem",
    "style.fontSize.length",
    "style.letterSpacing.length",
    "flow.gap.length",
    "style.lineBreak.strict_loose",
    "style.textOverflow.clip",
    "style.textCombineUpright.all",
    "style.textDecoration.combined",
    "style.border.sides",
    "style.borderStyle.dashed_dotted",
    "template.version.scalar",
    "table.column.width.length",
    "line.length",
    "char_grid.markup.aozora.page_break",
    "char_grid.markup.aozora.large",
    "char_grid.markup.aozora.placement",
    "definitions.field.image",
    "format.wareki",
    "format.patterns.cldr",
    "format.currency.variants",
    "format.currency.coerce",
    "format.units.semantic",
    "format.number.groupSizes",
    "format.dated.declared_first",
    // The definitions wire's shape as a whole, not one node of it.
    "definitions.schema",
    // BEHAVIOUR of keys that already exist: what they do, or where.
    "page.margin",
    "flow.box.optional",
    "checkbox.auto_size",
    "char_grid.containers",
    "char_grid.textAlign",
    "image.cells",
    "image.opacity",
    "style.backgroundColor.box",
    "style.writingMode.surfaces",
    "style.writingMode.block_styles",
    "table.style.verticalAlign",
    "table.header.style.verticalAlign",
    "table.headerGroups.style.fill",
    // What a HOST offers, outside the template wire.
    "inspect.boxes",
    "inspect.boxes.all_items",
    "inspect.boxes.linked",
    "inspect.text_metrics",
    "inspect.text_metrics.vertical",
    "table.boxes",
    "table.header.hidden_boxes",
    "repeat.boxes",
    "render.pdf",
    "preview.png",
    "preview.raw",
    "preview.page",
    "mcp.stdio",
    "mcp.inline_sources",
    "mcp.asset_policy",
    "mcp.examples",
    "mcp.formats",
    "mcp.reference",
    "wasm.bindings",
    "wasm.errors.typed",
    "wasm.fonts.subset",
    "wasm.fonts.faces",
    "wasm.render.pdf",
    "capi.abi",
    "capi.sign.external",
    "cli.report",
    "cli.sign.external",
    "cli.font.add",
    "fonts.face.url",
    "locale.builtin",
    "locale.facts",
    "format.catalog",
    "format.catalog.dropsTime",
    "diagnostics.args",
    "diagnostics.parse_error",
    "diagnostics.layout.path",
    "diagnostics.deprecated_syntax",
];

/// Template-level pairs: the registries and the two document-wide blocks.
const TEMPLATE: [(&str, &str); 4] = [
    ("Template.styles", "styles"),
    ("Template.formats", "template.formats"),
    ("Template.defaults", "template.defaults"),
    ("Template.document", "template.document.metadata"),
];

/// The capability a node's NAME implies, if the engine declares one.
fn by_name(node: &str) -> Option<String> {
    let segments: Vec<&str> = node.split('.').collect();
    let key = match segments.as_slice() {
        ["Style", key] => format!("style.{key}"),
        ["Item", kind] => (*kind).to_string(),
        [.., "visible"] => "item.visible".to_string(),
        [.., "styleNames"] => "styleNames".to_string(),
        [.., "bindings"] => "binding.declarations".to_string(),
        _ => return None,
    };
    CAPABILITIES.contains(&key.as_str()).then_some(key)
}

/// Every gated node in `catalog`, with its capability key. A listed pair
/// replaces what the naming rule would say for the same node (a shape's
/// `styleNames` is gated by the shape's own move onto `Style`).
pub fn gated(catalog: &Value) -> Vec<(String, String)> {
    let listed: Vec<(&str, &str)> = NAMED
        .iter()
        .chain(BOX.iter())
        .chain(TEMPLATE.iter())
        .copied()
        .collect();
    let by_rule: Vec<(String, String)> = super::super::annotations::nodes(catalog)
        .into_iter()
        .filter(|node| !listed.iter().any(|(listed, _)| listed == node))
        .filter_map(|node| by_name(&node).map(|key| (node, key)))
        .collect();
    by_rule
        .into_iter()
        .chain(
            listed
                .into_iter()
                .map(|(node, key)| (node.to_string(), key.to_string())),
        )
        .collect()
}
