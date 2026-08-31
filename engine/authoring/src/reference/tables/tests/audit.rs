//! The completeness rule. Rendering makes the tables consistent; only this
//! notices that a key was added to the wire and to nobody's table.

use crate::reference::tables::{audit, parse, Problem};

/// The catalog-only cases pass an EMPTY registry: with no diagnostics table
/// in the fixture, any code in the registry would correctly be reported as
/// undocumented, which is a different rule's failure and would drown these.
fn problems(yaml: &str) -> Vec<Problem> {
    audit(
        &super::catalog(),
        &parse(yaml).expect("the fixture parses"),
        &std::collections::BTreeSet::new(),
    )
}

#[test]
fn the_baseline_is_clean() {
    // The control every failure test below perturbs by exactly one thing. A
    // suite whose baseline already fails cannot tell you which change caused
    // which problem.
    assert_eq!(problems(super::spec_yaml()), vec![]);
}

#[test]
fn a_key_the_node_does_not_have_is_named() {
    let yaml = super::spec_yaml().replace(r#"keys: ["fit"]"#, r#"keys: ["nope"]"#);
    assert!(problems(&yaml).contains(&Problem::UnknownKey {
        id: "box#keys".to_owned(),
        key: "nope".to_owned(),
    }));
}

#[test]
fn a_key_the_node_has_and_nothing_shows_is_named() {
    let yaml = drop_fit_row();
    assert!(problems(&yaml).contains(&Problem::Uncovered {
        id: "box#keys".to_owned(),
        key: "fit".to_owned(),
    }));
}

#[test]
fn an_omitted_key_with_a_reason_is_covered() {
    let yaml = drop_fit_row() + "  omitted:\n    fit: \"documented on image.md\"\n";
    assert_eq!(problems(&yaml), vec![]);
}

#[test]
fn an_omitted_key_with_a_blank_reason_is_named() {
    let yaml = drop_fit_row() + "  omitted:\n    fit: \"   \"\n";
    assert!(problems(&yaml).contains(&Problem::BlankReason {
        id: "box#keys".to_owned(),
        key: "fit".to_owned(),
    }));
}

#[test]
fn an_omission_for_a_key_the_node_lost_is_named() {
    // The stale half. A key retired from the wire leaves its excuse behind,
    // and an excuse for something that no longer exists reads as coverage.
    let yaml = super::spec_yaml().to_owned() + "  omitted:\n    gone: \"retired\"\n";
    assert!(problems(&yaml).contains(&Problem::StaleOmission {
        id: "box#keys".to_owned(),
        key: "gone".to_owned(),
    }));
}

#[test]
fn a_table_naming_no_catalog_node_is_named() {
    let yaml = super::spec_yaml().replace("node: Box", "node: Nope");
    assert_eq!(
        problems(&yaml),
        vec![Problem::UnknownNode {
            id: "box#keys".to_owned(),
            node: "Nope".to_owned(),
        }],
        "and nothing else is reported about a table that cannot be checked"
    );
}

#[test]
fn a_subset_table_owes_no_completeness_but_owes_a_sentence() {
    let missing = drop_fit_row();
    let subset = missing.replace("coverage: full", "coverage: subset");
    assert_eq!(
        problems(&subset),
        vec![Problem::UnnamedSubset {
            id: "box#keys".to_owned()
        }],
        "the uncovered key is excused; the missing sentence is not"
    );
    let named = subset.replace(
        "coverage: subset",
        "coverage: subset\n  subset: \"the size keys; `fit` is on image.md\"",
    );
    assert_eq!(problems(&named), vec![]);
}

#[test]
fn a_blank_subset_sentence_is_not_a_sentence() {
    let yaml = super::spec_yaml().replace("coverage: full", "coverage: subset\n  subset: \"  \"");
    assert!(problems(&yaml).contains(&Problem::UnnamedSubset {
        id: "box#keys".to_owned()
    }));
}

#[test]
fn a_cross_branch_table_checks_keys_against_every_branch() {
    // `template.md`'s item-common table has no single node to be complete
    // against, but a key it names must still exist on SOME item type — which
    // is what catches a key retired from the wire.
    let yaml = "t:\n  page: template\n  node: Item\n  coverage: none\n  columns: []\n  rows:\n    - keys: [\"text\"]\n    - keys: [\"fill\"]\n";
    assert_eq!(
        problems(yaml),
        vec![],
        "each key lives on a different branch"
    );
    let bad = yaml.replace(r#"keys: ["fill"]"#, r#"keys: ["nope"]"#);
    assert!(problems(&bad).contains(&Problem::UnknownKey {
        id: "t".to_owned(),
        key: "nope".to_owned(),
    }));
}

#[test]
fn an_override_with_no_reason_is_named() {
    // Without this clause a page could override every cell and be exactly as
    // hand-written as before, while the `Generated` badge claimed otherwise.
    // The override must be on a DERIVED column — text for an `authored` one
    // is that column's only source, not an override of anything. `Key` is the
    // derived column a catalog table has.
    let yaml = super::spec_yaml().replace(
        "        \"Type\": \"`contain` | `cover`\"",
        "        \"Key\": \"`fit` (the fit mode)\"\n        \"Type\": \"`contain` | `cover`\"",
    );
    assert!(problems(&yaml).contains(&Problem::UnexplainedOverride {
        id: "box#keys".to_owned(),
        key: "fit".to_owned(),
    }));
    let excused = yaml.replace(
        "        \"Description\": \"How the content fills the box.\"",
        "        \"Description\": \"How the content fills the box.\"\n      reason: \"the page spells the key with a gloss\"",
    );
    assert_eq!(problems(&excused), vec![]);
}

#[test]
fn a_blank_reason_does_not_excuse_an_override() {
    let yaml = super::spec_yaml()
        .replace(
            "        \"Type\": \"`contain` | `cover`\"",
            "        \"Key\": \"`fit` (gloss)\"\n        \"Type\": \"`contain` | `cover`\"",
        )
        .replace(
            "        \"Description\": \"How the content fills the box.\"",
            "        \"Description\": \"How the content fills the box.\"\n      reason: \"   \"",
        );
    assert!(problems(&yaml).contains(&Problem::UnexplainedOverride {
        id: "box#keys".to_owned(),
        key: "fit".to_owned(),
    }));
}

#[test]
fn an_authored_column_with_no_text_on_a_row_is_named() {
    let yaml = super::spec_yaml()
        .replace("        \"Description\": \"The border-box size.\"\n", "")
        .replace(
            "        \"Description\": \"How the content fills the box.\"\n",
            "",
        );
    let found = problems(&yaml);
    assert!(found.contains(&Problem::EmptyAuthored {
        id: "box#keys".to_owned(),
        key: "w".to_owned(),
        column: "Description".to_owned(),
    }));
    assert!(found.contains(&Problem::EmptyAuthored {
        id: "box#keys".to_owned(),
        key: "fit".to_owned(),
        column: "Description".to_owned(),
    }));
}

#[test]
fn every_problem_names_its_table() {
    let all = [
        Problem::UnknownNode {
            id: "t".into(),
            node: "N".into(),
        },
        Problem::NoNode { id: "t".into() },
        Problem::UnknownCode {
            id: "t".into(),
            code: "c".into(),
        },
        Problem::UnknownKey {
            id: "t".into(),
            key: "k".into(),
        },
        Problem::Uncovered {
            id: "t".into(),
            key: "k".into(),
        },
        Problem::StaleOmission {
            id: "t".into(),
            key: "k".into(),
        },
        Problem::BlankReason {
            id: "t".into(),
            key: "k".into(),
        },
        Problem::UnnamedSubset { id: "t".into() },
        Problem::UnexplainedOverride {
            id: "t".into(),
            key: "k".into(),
        },
        Problem::EmptyAuthored {
            id: "t".into(),
            key: "k".into(),
            column: "c".into(),
        },
    ];
    for problem in all {
        assert!(problem.to_string().contains("`t`"), "{problem:?}");
    }
    // The one problem that is NOT about a table: a registry code no table
    // documents names the CODE, because there is no table to name.
    let orphan = Problem::UndocumentedCode {
        code: "lost_code".into(),
    };
    assert!(orphan.to_string().contains("`lost_code`"), "{orphan:?}");
    assert!(orphan.to_string().contains("no reference table"));
}

/// The baseline without its `fit` row — the row AND the cells under it, since
/// a row now carries its own authored text.
fn drop_fit_row() -> String {
    let y = super::spec_yaml();
    let at = y
        .find("    - keys: [\"fit\"]")
        .expect("the baseline has a fit row");
    y[..at].to_owned()
}
