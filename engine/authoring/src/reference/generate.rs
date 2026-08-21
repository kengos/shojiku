//! Catalog generation — the half that needs the schema derive.
//!
//! Two roots, one document: `template` and `definitions` are the two
//! authorable files, and `params` is a free-form value tree with no schema
//! to derive. Both roots feed one `$defs`, so a type reached from either is
//! described once and referenced by name from both.
//!
//! `for_deserialize` is the contract that matters here: the catalog says
//! what an author may WRITE, not what the engine emits.

use schemars::generate::SchemaSettings;
use schemars::transform::{transform_subschemas, Transform};
use schemars::Schema;
use shojiku_core::{Definitions, Template};

/// The catalog's `$id`.
///
/// Rooted at the project's REAL home (`[workspace.package] homepage`), not a
/// plausible-looking domain nobody here owns. A `$id` is an identifier and
/// need not resolve, but pointing it at someone else's namespace is a claim
/// about the outside world, and this one has an answer in the tree. The path
/// is the decided reference identifier, so `/reference/<page>`,
/// `shojiku://reference/<page>` and `docs/engine/<page>.md#<key>` stay three
/// spellings of one thing.
const CATALOG_ID: &str = "https://shojiku.pages.dev/reference/catalog.schema.json";

/// Removes the prose schemars lifts out of Rust doc comments.
///
/// Not thrift — a decision. Doc comments in this workspace are engine
/// developer material, written in a different register from anything an
/// author reads ("in `column` this is the existing fill-width behavior"),
/// and they cannot carry a second locale. Node-local `description` belongs
/// to the annotation layer: authored per locale, merged in at generation
/// time, and gated by "every node has an annotation".
///
/// Leaving the doc comments in would defeat that gate rather than help it —
/// every node would arrive pre-annotated with text nobody wrote for authors,
/// so the gate would pass vacuously and the missing prose would be
/// undetectable. The catalog this stage ships carries STRUCTURE, and the
/// empty `description` slots are what make the next stage's absence
/// meaningful.
#[derive(Debug, Clone)]
struct StripDeveloperProse;

impl Transform for StripDeveloperProse {
    fn transform(&mut self, schema: &mut Schema) {
        schema.remove("description");
        schema.remove("title");
        transform_subschemas(self, schema);
    }
}

/// Generates the catalog from the parser, as the bytes that belong at
/// [`super::CATALOG_PATH`].
///
/// Deterministic: the definition map is a `serde_json::Map` (a `BTreeMap` —
/// `preserve_order` is deliberately not enabled), the generator reads only
/// type information, and nothing here consults the clock, the filesystem or
/// the environment. Two runs produce the same bytes.
#[must_use]
pub fn generate() -> String {
    let mut generator = SchemaSettings::draft2020_12()
        .for_deserialize()
        .with_transform(StripDeveloperProse)
        .into_generator();

    let template = generator.subschema_for::<Template>();
    let definitions = generator.subschema_for::<Definitions>();
    let defs = generator.take_definitions(true);

    let document = serde_json::json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": CATALOG_ID,
        "title": "Shojiku authorable wire",
        "description": "Per-key facts of the Shojiku template and definitions \
                        wire, derived from the parser. Regenerate with \
                        `make reference:generate`; `make reference:check` fails \
                        on drift.",
        "type": "object",
        "properties": {
            "template": template,
            "definitions": definitions,
        },
        "$defs": defs,
    });

    // Serializing a `serde_json::Value` has no failing path: every value in
    // it came out of the same library and carries no custom Serialize.
    let mut out = serde_json::to_string_pretty(&document)
        .expect("serializing a serde_json::Value cannot fail");
    out.push('\n');
    out
}
