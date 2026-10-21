//! The fact tables against what the wire accepts, and the rows the
//! context-inert lists are derived from.

use super::*;
use crate::ItemKind;
use crate::style::Style;
use std::collections::BTreeSet;

fn names(keys: impl IntoIterator<Item = StyleKey>) -> BTreeSet<&'static str> {
    keys.into_iter().map(StyleKey::as_str).collect()
}

#[test]
fn every_initial_value_is_one_the_wire_takes() {
    let mut with_initial = 0;
    for key in keys() {
        let Some(value) = initial(key) else { continue };
        with_initial += 1;
        let yaml = format!("{{ {}: {} }}", key.as_str(), value.to_json());
        let style: Style = serde_yaml::from_str(&yaml).unwrap_or_else(|e| panic!("{yaml}: {e}"));
        assert!(style.is_set(key), "{yaml}");
    }
    assert_eq!(
        with_initial, 21,
        "fontFamily, backgroundColor, borderRadius have none"
    );
    let line: crate::LineStyle =
        serde_yaml::from_str("{ width: 1, color: '#000000', opacity: 1, style: solid }")
            .expect("the line keys parse");
    let written = serde_json::to_value(line).expect("a line style serializes");
    let listed: BTreeSet<&str> = line_initial().iter().map(|(k, _)| *k).collect();
    let fields: BTreeSet<&str> = written
        .as_object()
        .expect("a map")
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(listed, fields, "line_initial names every line style key");
}

#[test]
fn a_range_admits_its_bounds_and_its_fallback_and_refuses_past_them() {
    let ranged: Vec<(StyleKey, ScalarRange)> =
        keys().filter_map(|k| range(k).map(|r| (k, r))).collect();
    assert_eq!(
        names(ranged.iter().map(|(k, _)| *k)),
        BTreeSet::from([
            "fontSize",
            "lineHeight",
            "letterSpacing",
            "borderWidth",
            "opacity"
        ])
    );
    let all = ranged.iter().map(|(_, r)| *r).chain([LINE_WIDTH]);
    for r in all {
        assert!(r.admits(r.fallback), "{r:?} refuses its own fallback");
        assert!(r.admits(r.max));
        assert!(!r.admits(r.max + 1.0));
        assert_eq!(r.admits(r.min), !r.min_exclusive, "{r:?} at min");
        assert!(!r.admits(r.min - 1.0));
        assert!(!r.admits(f64::NAN));
        assert!(!r.admits(f64::INFINITY));
    }
}

#[test]
fn inheritance_is_the_css_text_half() {
    let inherited = names(keys().filter(|k| inherits(*k)));
    assert_eq!(inherited.len(), 14);
    for key in [
        "verticalAlign",
        "backgroundColor",
        "opacity",
        "textDecoration",
    ] {
        assert!(!inherited.contains(key), "{key} must not inherit");
    }
}

#[test]
fn no_row_names_a_surface_twice_or_a_kind_with_no_style() {
    let styleless = [
        ItemKind::Line,
        ItemKind::Repeat,
        ItemKind::RepeatFlow,
        ItemKind::PageBreak,
    ];
    for key in keys() {
        let row = painted_by(key);
        let distinct: BTreeSet<Surface> = row.iter().copied().collect();
        assert_eq!(distinct.len(), row.len(), "{key:?} repeats a surface");
        for kind in styleless {
            assert!(
                !row.contains(&Surface::Item(kind)),
                "{key:?} names {kind:?}"
            );
        }
    }
    assert_eq!(surfaces().count(), 18);
}

#[test]
fn takes_adds_what_inherits_into_held_content() {
    let container = Surface::Item(ItemKind::Container);
    let table = Surface::Item(ItemKind::Table);
    // Inherited into the children, though the container paints no text.
    assert!(takes(container, StyleKey::FontSize));
    assert!(!painted_by(StyleKey::FontSize).contains(&container));
    // Not inherited, and the container paints none of it.
    assert!(!takes(container, StyleKey::TextDecoration));
    // Painted by the container itself.
    assert!(takes(container, StyleKey::Overflow));
    // A table's own value is its cells' fallback, though it does not inherit.
    assert!(takes(table, StyleKey::VerticalAlign));
    assert!(!takes(Surface::Item(ItemKind::Rect), StyleKey::FontSize));
    assert!(holds_content(table) && !holds_content(Surface::Span));
}

/// Each form mark's row on its own: `rect` paints a superset, so a union of
/// the shapes would hide a wrong mark row. A mark strokes its outline as one
/// path, so it takes neither a border pattern nor a radius.
#[test]
fn each_form_mark_paints_its_fill_border_and_alpha_only() {
    let expected = BTreeSet::from(["backgroundColor", "borderWidth", "borderColor", "opacity"]);
    for surface in [
        Surface::Item(ItemKind::Ellipse),
        Surface::Item(ItemKind::Checkbox),
        Surface::Mark,
    ] {
        let row = names(keys().filter(|k| painted_by(*k).contains(&surface)));
        assert_eq!(row, expected, "{surface:?}");
    }
}

#[test]
fn the_document_root_takes_exactly_the_inherited_keys() {
    let taken = names(keys().filter(|k| takes(Surface::Document, *k)));
    assert_eq!(taken, names(keys().filter(|k| inherits(*k))));
    assert!(keys().all(|k| !painted_by(k).contains(&Surface::Document)));
}

#[test]
fn surface_initials_name_the_surfaces_that_start_elsewhere() {
    let overrides: Vec<(Surface, StyleKey, Initial)> = surfaces()
        .flat_map(|s| keys().map(move |k| (s, k)))
        .filter_map(|(s, k)| surface_initial(s, k).map(|v| (s, k, v)))
        .collect();
    assert_eq!(overrides.len(), 7);
    for (surface, key, value) in overrides {
        assert!(takes(surface, key), "{surface:?} does not take {key:?}");
        assert_ne!(
            Some(value),
            initial(key),
            "{surface:?} {key:?} restates the root"
        );
    }
    assert_eq!(
        surface_initial(Surface::Mark, StyleKey::BorderWidth),
        Some(Initial::Number(MARK_STROKE_PT))
    );
    assert_eq!(
        surface_initial(Surface::Item(ItemKind::Table), StyleKey::VerticalAlign),
        Some(Initial::Keyword("middle"))
    );
    let derived = surface_initial(Surface::Item(ItemKind::CharGrid), StyleKey::FontSize);
    assert_eq!(derived.map(Initial::to_json), Some(serde_json::Value::Null));
}

#[test]
fn the_table_cell_alignment_constant_is_the_keyword_the_table_states() {
    let keyword = serde_json::to_value(TABLE_CELL_VERTICAL_ALIGN).expect("serializes");
    assert_eq!(
        surface_initial(Surface::Item(ItemKind::Table), StyleKey::VerticalAlign)
            .map(Initial::to_json),
        Some(keyword)
    );
}
