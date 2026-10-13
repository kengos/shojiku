//! A table's header labels — `columns[].label` and
//! `headerGroups[].label` — interpolate against TOP-LEVEL params, like
//! any static text, so they get the scalar key checks and the charset
//! scan, in the body and in a band alike.

use super::*;

/// A one-column table over `order_items` whose column label is
/// `column_label` and whose single header group label is `group_label`.
fn labelled(column_label: &str, group_label: &str) -> String {
    format!(
        "      - type: table\n        data: {{ key: order_items }}\n        headerGroups:\n          - {{ label: \"{group_label}\", span: 1 }}\n        columns:\n          - {{ label: \"{column_label}\", data: {{ key: name }} }}\n"
    )
}

fn paths_of<'a>(diags: &'a Diagnostics, code: &str) -> Vec<&'a str> {
    diags
        .iter()
        .filter(|d| d.code == code)
        .filter_map(|d| d.path.as_deref())
        .collect()
}

#[test]
fn unknown_label_keys_are_reported_at_the_column_and_the_group() {
    let t = tpl(&labelled("{ghost_a}", "{ghost_b}"));
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_data_key"),
        [
            "sections.body.items[0].columns[0]",
            "sections.body.items[0].headerGroups[0]",
        ]
    );
}

#[test]
fn a_band_table_label_is_checked_too() {
    let t = parse_template(&format!(
        "sections:\n  footer:\n    items:\n{}  body:\n    type: flow\n    items: []\n",
        labelled("{ghost_a}", "{ghost_b}")
    ))
    .expect("template");
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_data_key"),
        [
            "sections.footer.items[0].columns[0]",
            "sections.footer.items[0].headerGroups[0]",
        ]
    );
}

#[test]
fn a_label_reads_top_level_params_not_the_row() {
    // `name` is a field of the bound rows, but a header belongs to no row.
    let t = tpl(&labelled("{name}", "{order.code}"));
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_data_key"),
        ["sections.body.items[0].columns[0]"]
    );
}

#[test]
fn a_label_key_absent_from_params_is_missing_data() {
    let t = tpl(&labelled("{order.code}", "Group"));
    let params = json!({ "order_items": [] });
    let diags = validate(Some(&defs()), &t, Some(&params));
    assert_eq!(
        paths_of(&diags, "missing_data"),
        ["sections.body.items[0].columns[0]"]
    );
}

#[test]
fn a_label_format_pick_is_checked() {
    let t = tpl(&labelled("{order.total:bogus}", "Group"));
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_format"),
        ["sections.body.items[0].columns[0]"]
    );
}

#[test]
fn a_label_charset_mistake_warns_without_definitions() {
    let t = tpl(&labelled("{品名}", "{期間}"));
    let diags = validate(None, &t, None);
    let hits: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "interpolation_key_charset")
        .collect();
    assert_eq!(hits.len(), 2, "{diags:?}");
    for (hit, text) in hits.iter().zip(["{品名}", "{期間}"]) {
        assert_eq!(hit.path.as_deref(), Some("sections.body.items[0]"));
        assert!(hit.message.contains(text), "{}", hit.message);
    }
}

#[test]
fn plain_and_known_labels_are_clean() {
    let t = tpl(&labelled("品名", "{order.code}"));
    let params = json!({ "order": { "code": "A-1" }, "order_items": [] });
    let diags = validate(Some(&defs()), &t, Some(&params));
    assert!(diags.is_empty(), "{diags:?}");
}
