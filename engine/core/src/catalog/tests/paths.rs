//! `resolve_array_path` — the row-relative→full join every consumer of a
//! nested source routes through, and the one place the two scopes must
//! not leak into each other.

use super::nested::{catalog, shipping};

#[test]
fn a_row_relative_source_never_falls_back_to_a_top_level_namesake() {
    // `resolve_array_path` is the row-relative→full join every consumer
    // routes through. A list inside an `orders` cell bound to `items`
    // reads the ROW's field, so resolving it to a TOP-LEVEL `items` that
    // happens to share the name would check its entries — and format
    // them — against the wrong element entirely.
    let catalog = catalog(
        r#"
type: object
properties:
  items:
    type: array
    items:
      type: object
      properties:
        title:
          type: string
  orders:
    type: array
    items:
      type: object
      properties:
        code:
          type: string
"#,
    );
    assert_eq!(
        catalog.resolve_array_path(None, "items").as_deref(),
        Some("items")
    );
    // `orders` rows carry no `items`, and the top-level one is not it.
    assert_eq!(catalog.resolve_array_path(Some("orders"), "items"), None);
    // Nor does a document-scope key reach INTO a group.
    assert_eq!(catalog.resolve_array_path(None, "orders.items"), None);
    // The declared nesting is what resolves.
    let nested = shipping();
    assert_eq!(
        nested
            .resolve_array_path(Some("orders"), "items")
            .as_deref(),
        Some("orders.items")
    );
    assert_eq!(nested.resolve_array_path(None, "items"), None);
}
