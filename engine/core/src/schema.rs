//! `schema` — hand-written `JsonSchema` impls for the wire types whose
//! `Deserialize` is hand-written too.
//!
//! Every wire type in this crate carries
//! `#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]`, which is
//! correct exactly when serde's own derive is what parses it. Fourteen types
//! parse through a hand-rolled `impl Deserialize` instead, and for those the
//! derive would describe the RUST shape while the parser accepts something
//! else — `Length` is `enum { Pt, Physical, Percent, Em, Rem }` in Rust and
//! `10` or `"10mm"` on the wire. A catalog that got those wrong would be
//! wrong about precisely the keys authors get wrong.
//!
//! So they are written here, out of the wire files: fourteen impls in-file
//! would push `definitions/schema.rs`, `edges.rs` and `style/border.rs` past
//! the 300-line budget, while one `cfg_attr` line per type does not.
//!
//! Two shapes appear:
//!
//! - **forwarded** — the impl deserializes through an intermediate `*Repr`
//!   whose derived schema IS the accepted shape, so the schema delegates to
//!   it and cannot drift (`Length`, `PageSize`, `FlexBasis`, `GridTrack`);
//! - **hand-written** — the impl is a visitor with no single `Repr`, so the
//!   accepted forms are spelled out here and pinned by a test that feeds each
//!   declared form through the real `Deserialize`.
//!
//! What is deliberately NOT here is prose. Node-local `description` is the
//! annotation layer's job, authored per locale and merged at generation time;
//! these impls carry structure only.

use schemars::{json_schema, JsonSchema, Schema, SchemaGenerator};

mod border;
mod edges;
mod length;
mod point;
mod value;

#[cfg(test)]
mod tests;

/// The four side keys the per-side map forms accept, in CSS order.
pub(crate) const SIDES: [&str; 4] = ["top", "right", "bottom", "left"];

/// A `{ top/right/bottom/left }` map of `side`, every key optional and
/// unknown keys rejected — the shape `style/border.rs`'s `visit_sides`
/// enforces by hand for all three border properties.
pub(crate) fn per_side_map(side: &Schema) -> Schema {
    let mut properties = serde_json::Map::new();
    for name in SIDES {
        properties.insert(name.to_string(), side.clone().to_value());
    }
    json_schema!({
        "type": "object",
        "properties": properties,
        "additionalProperties": false,
    })
}

/// The schema of `T` as a `$ref` into `$defs` (or inline, if `T` asks for
/// it) — how a type reaches another type's schema without copying it.
pub(crate) fn sub<T: JsonSchema>(generator: &mut SchemaGenerator) -> Schema {
    generator.subschema_for::<T>()
}
