//! One page's regeneration: the errors it reports, and that it reports ALL of
//! them rather than the first.

use crate::reference::tables::{page, pages, Error, Inputs};
use std::collections::BTreeMap;

fn inputs<'a>(
    spec: &'a crate::reference::tables::Spec,
    registry: &'a BTreeMap<String, String>,
) -> Inputs<'a> {
    Inputs { spec, registry }
}

const PAGE: &str =
    "# Box\n\n<!-- rf:table:start box#keys (generated) -->\nOLD\n<!-- rf:table:end -->\n";

#[test]
fn writes_the_table_between_the_markers() {
    let spec = super::spec();
    let reg = super::registry();
    let out = page("box", PAGE, &inputs(&spec, &reg)).expect("renders");
    assert!(out.contains("| Key | Type | Description |"));
    assert!(!out.contains("OLD"));
}

#[test]
fn pages_names_every_stem_the_spec_covers() {
    assert_eq!(
        pages(&super::spec()).into_iter().collect::<Vec<_>>(),
        ["box"]
    );
}

#[test]
fn a_page_with_no_marker_is_reported_not_silently_skipped() {
    let spec = super::spec();
    let reg = super::registry();
    let errors = page("box", "# Box\n\nno marker here\n", &inputs(&spec, &reg))
        .expect_err("the page carries no marker");
    assert_eq!(errors.len(), 1);
    assert!(matches!(errors[0], Error::Splice(_)));
    assert!(errors[0].to_string().contains("box#keys"));
}

#[test]
fn a_cell_no_source_can_fill_is_reported_with_its_column() {
    // Strip the rows' own Description text: that column is `authored`, so
    // with the text gone nothing can fill it. Every row reports, and the
    // message names the row AND the column rather than saying the page
    // failed.
    let mut spec = super::spec();
    for row in &mut spec.get_mut("box#keys").expect("the baseline table").rows {
        row.cells.remove("Description");
    }
    let reg = super::registry();
    let errors = page("box", PAGE, &inputs(&spec, &reg))
        .expect_err("an authored column with no text on any row");
    assert_eq!(errors.len(), 2, "both rows report, not just the first");
    let rendered = errors[0].to_string();
    assert!(rendered.contains("box#keys"), "{rendered}");
    assert!(rendered.contains("Description"), "{rendered}");
    assert!(matches!(errors[0], Error::Cell(_)));
}

#[test]
fn a_page_the_spec_has_no_table_for_is_returned_unchanged() {
    let spec = super::spec();
    let reg = super::registry();
    let out = page("other", PAGE, &inputs(&spec, &reg)).expect("nothing to do");
    assert_eq!(out, PAGE);
}
