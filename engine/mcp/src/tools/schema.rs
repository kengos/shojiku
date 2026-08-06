//! Tool descriptors: names, descriptions, and hand-written JSON schemas.
//! The conformance tests pin this shape — changing a name or schema is a
//! client-visible contract change.

use super::assets::MAX_ASSET_IDS;
use super::sources::MAX_INLINE_BYTES;
use serde_json::{json, Value};

/// The `tools/list` descriptor array.
pub(crate) fn descriptors() -> Value {
    json!([
        {
            "name": "validate",
            "description": "Validate definitions/template/params and return the full diagnostics list as JSON (parse errors surface as diagnostics too).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "definitions": inline_prop("definitions.yml source (optional but recommended: enables schema-aware checks)"),
                    "definitionsPath": path_prop("Path to definitions.yml (optional but recommended: enables schema-aware checks)"),
                    "template": inline_prop("templates.yml source"),
                    "templatePath": path_prop("Path to templates.yml"),
                    "params": inline_prop("params JSON/YAML source (optional)"),
                    "paramsPath": path_prop("Path to params.json/yml (optional)"),
                },
                "allOf": [either_of("template", "templatePath")],
            },
        },
        {
            "name": "render_preview",
            "description": "Lay out and rasterize the document; returns one PNG image per page followed by the diagnostics JSON. The layout tree/boxes for the same inputs are retrievable via inspect_layout.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "definitions": inline_prop("definitions.yml source (optional)"),
                    "definitionsPath": path_prop("Path to definitions.yml (optional)"),
                    "template": inline_prop("templates.yml source"),
                    "templatePath": path_prop("Path to templates.yml"),
                    "params": inline_prop("params JSON/YAML source"),
                    "paramsPath": path_prop("Path to params.json/yml"),
                    "lang": lang_prop(),
                    "scale": { "type": "number", "description": "Output pixels per layout point (default 2.0 ≈ 144 dpi)" },
                    "page": { "type": "integer", "minimum": 1, "description": "Render only this 1-based page (default: every page, capped)" },
                    "assetsDir": assets_dir_prop(),
                    "assetMode": asset_mode_prop(),
                    "allowDynamicImage": id_list_prop("Item ids allowed to receive inline dynamic image content even under `bundled-only`"),
                    "denyDynamicImage": id_list_prop("Item ids denied any dynamic image content even under `open`"),
                },
                "allOf": [either_of("template", "templatePath"), either_of("params", "paramsPath")],
            },
        },
        {
            "name": "inspect_layout",
            "description": "Lay out the document and return the inspect envelope (engine info, layout tree, path-addressed boxes for every item, page margins) followed by the diagnostics JSON.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "definitions": inline_prop("definitions.yml source (optional)"),
                    "definitionsPath": path_prop("Path to definitions.yml (optional)"),
                    "template": inline_prop("templates.yml source"),
                    "templatePath": path_prop("Path to templates.yml"),
                    "params": inline_prop("params JSON/YAML source"),
                    "paramsPath": path_prop("Path to params.json/yml"),
                    "lang": lang_prop(),
                    "assetsDir": assets_dir_prop(),
                    "assetMode": asset_mode_prop(),
                    "allowDynamicImage": id_list_prop("Item ids allowed to receive inline dynamic image content even under `bundled-only`"),
                    "denyDynamicImage": id_list_prop("Item ids denied any dynamic image content even under `open`"),
                },
                "allOf": [either_of("template", "templatePath"), either_of("params", "paramsPath")],
            },
        },
        {
            "name": "capabilities",
            "description": "This engine build's version and machine-readable capability key list (feature gating; needs no inputs).",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "list_examples",
            "description": "List the bundled example documents: for each, its shojiku://example/... URI, title, what syntax it exercises, its source file names and total size. Start here — authoring from a working example beats writing a template from scratch (needs no inputs).",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "get_example",
            "description": "Read one bundled example by its shojiku://example/<bucket>/<name> URI: returns its source files together (templates.yml with the definitions.yml its bindings need, and params.json). Append /<file> to read a single file. Same content as resources/read, for clients that do not fetch resources.",
            "inputSchema": {
                "type": "object",
                "properties": { "uri": example_uri_prop() },
                "required": ["uri"],
            },
        },
    ])
}

/// The example-reference property: the exact URI shape, since a wrong
/// guess costs a round trip.
fn example_uri_prop() -> Value {
    json!({
        "type": "string",
        "description": "An example URI from list_examples: `shojiku://example/<bucket>/<name>` for the whole entry, or `shojiku://example/<bucket>/<name>/<file>` for one source file",
    })
}

/// A string path property with a description.
fn path_prop(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

/// An inline-source property: the text itself, for clients that cannot share
/// a filesystem with the server.
fn inline_prop(description: &str) -> Value {
    json!({
        "type": "string",
        "description": format!(
            "{description}, passed inline instead of by path. Mutually exclusive with the matching *Path argument; at most {MAX_INLINE_BYTES} bytes."
        ),
    })
}

/// The either-or constraint between a source's inline and path spellings
/// (composed under `allOf`, so several sources can each carry one).
///
/// A flat `required` cannot express "one of these two keys". MCP 2025-06-18
/// constrains `Tool.inputSchema` only to `type: "object"` (its `properties`
/// / `required` entries are optional and the object is not closed), so the
/// extra JSON Schema keywords are conformant; the parser is still the real
/// gate for clients that only read `properties`.
fn either_of(inline: &str, path: &str) -> Value {
    json!({ "anyOf": [{ "required": [inline] }, { "required": [path] }] })
}

/// The locale-selection property, shared by the two layout tools.
fn lang_prop() -> Value {
    json!({
        "type": "string",
        "description": "Locale id (builtin: ja-JP, en-US); defaults to the template defaults.locale, then ja-JP",
    })
}

/// The bundled-asset root property.
fn assets_dir_prop() -> Value {
    json!({
        "type": "string",
        "description": "Directory bundled image assets resolve against (default: the template file's directory; an inline template without this argument has no bundled sources)",
    })
}

/// The dynamic-content mode property (the CLI's `--asset-mode` values).
fn asset_mode_prop() -> Value {
    json!({
        "type": "string",
        "enum": ["open", "bundled-only"],
        "description": "How params-supplied image content is treated: `open` (default) accepts inline content unless an item is denied; `bundled-only` accepts it only for explicitly allowed items",
    })
}

/// An item-id list property (allow/deny), bounded like the parser is.
fn id_list_prop(description: &str) -> Value {
    json!({
        "type": "array",
        "items": { "type": "string" },
        "maxItems": MAX_ASSET_IDS,
        "description": description,
    })
}
