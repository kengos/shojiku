//! The drift gate, over the REAL pages.
//!
//! Everything else here is synthetic, because a rule's failure legs have to be
//! reachable. This is the opposite claim: that the hand-written diagnostics
//! sections in `docs/engine/` still name only things the engine defines.
//!
//! It reads the pages off disk the way `tables/tests/committed.rs` does — no
//! `include_str!`, which would reach outside the crate and break `cargo
//! package` and the Docker builder — and it lives in the DEFAULT suite, so
//! `engine:test` and the coverage run both hold it, not only
//! `make reference:generate`.

use super::audit;
use crate::reference::pages::Known;
use std::path::PathBuf;

/// Every `docs/engine/*.md`, sorted, as `(file name, markdown)`.
fn corpus() -> Vec<(String, String)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/engine");
    let mut out: Vec<(String, String)> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()? != "md" {
                return None;
            }
            let name = path.file_name()?.to_str()?.to_owned();
            Some((name, std::fs::read_to_string(&path).ok()?))
        })
        .collect();
    out.sort();
    out
}

#[test]
fn every_hand_written_diagnostics_section_names_only_real_things() {
    let corpus = corpus();
    let borrowed: Vec<(&str, &str)> = corpus
        .iter()
        .map(|(name, text)| (name.as_str(), text.as_str()))
        .collect();
    let known = Known::of_this_build();
    let (problems, census) = audit(&borrowed, &known.vocabulary());

    // The population FIRST: a zero problem count is ambiguous between "clean"
    // and "the scan read nothing", and only these numbers tell the two apart.
    // Every one of them moves when a page's code claims move, which is the
    // event worth a second look; `make engine:test` names the new value.
    assert_eq!(census.pages, 34, "pages in docs/engine");
    assert_eq!(
        census.sections, 23,
        "pages carrying a `## Diagnostics` section"
    );
    assert_eq!(census.tables, 22, "of which carry a code table");
    assert_eq!(census.rows, 143, "table rows naming a code");
    assert_eq!(census.occurrences, 174, "column-1 code occurrences");
    assert_eq!(
        census.distinct, 134,
        "distinct codes named across the pages"
    );
    assert_eq!(census.tokens, 198, "underscore-bearing in-section tokens");
    assert_eq!(census.checked, 24, "of which the second rule judged");
    assert_eq!(census.exempt, 0, "no line has needed a waiver yet");
    // The third rule's own population, and the guard on its excused list.
    // `excused_names` is DISTINCT names actually hit: holding it equal to the
    // list's length is what turns an entry that has stopped being needed into
    // a red test rather than a mask that quietly grows.
    assert_eq!(census.outside, 666, "code-shaped names read in the prose");
    assert_eq!(
        census.excused, 13,
        "of which the excused list accounted for"
    );
    assert_eq!(
        census.excused_names,
        crate::reference::pages::excused_len(),
        "every excused name is still needed by the corpus — see \
         `no_excused_name_is_stale`"
    );

    let messages: Vec<String> = problems.iter().map(ToString::to_string).collect();
    assert!(
        messages.is_empty(),
        "a diagnostics section names something the engine does not define:\n  {}",
        messages.join("\n  ")
    );
}

#[test]
fn the_vocabulary_is_this_builds_own_registries() {
    // The positive control on the INPUTS. Floors rather than equalities: all
    // three sets are append-only, so a floor cannot rot into a chore while
    // still failing the case that matters — a set that arrived empty, which
    // would make the audit above pass by knowing nothing.
    let (registry, capabilities, catalog) = Known::of_this_build().sizes();
    assert!(registry >= 157, "the code registry is {registry}");
    assert!(capabilities >= 154, "the capability list is {capabilities}");
    assert!(catalog >= 326, "the catalog vocabulary is {catalog}");
}

#[test]
fn every_registry_code_carries_the_underscore_the_second_rule_filters_on() {
    // The scoping decision, asserted rather than remembered. If a code ever
    // arrives without an underscore, the second rule stops being able to see
    // it in prose and this says so at the moment the code is added.
    let bare: Vec<&str> = shojiku_diagnostics::DiagnosticCode::ALL
        .iter()
        .map(|code| code.as_str())
        .filter(|code| !code.contains('_'))
        .collect();
    assert_eq!(bare, Vec::<&str>::new());
}

#[test]
fn every_code_table_in_the_doc_set_is_audited_by_exactly_one_mechanism() {
    // The sweep the rule owes itself. Its own tests can only see the tables it
    // already matches, so neither they nor the census can notice a `Code` table
    // filed under a heading nobody thought of — audited by nothing, and looking
    // exactly like the 22 that are. This enumerates the CLASS instead: every
    // table in `docs/engine/` whose first header cell is `Code`, wherever it
    // sits, and subtracts the two mechanisms' territories.
    let mut mine = 0;
    let mut spec = 0;
    let mut orphans: Vec<String> = Vec::new();
    for (name, text) in corpus() {
        let mut inside = false;
        let mut fenced = false;
        for (n, line) in text.lines().enumerate() {
            if line.trim_start().starts_with("```") {
                fenced = !fenced;
                continue;
            }
            if fenced {
                continue;
            }
            if line.starts_with("## ") {
                inside = line.trim_end() == "## Diagnostics";
                continue;
            }
            if !first_cell_is_code(line) {
                continue;
            }
            if inside {
                mine += 1;
            } else if name == "diagnostics.md" {
                spec += 1;
            } else {
                orphans.push(format!("{name}:{}", n + 1));
            }
        }
    }
    assert_eq!(
        orphans,
        Vec::<String>::new(),
        "a `Code` table no mechanism audits — put it under `## Diagnostics`, \
         or give it a `source: diagnostics` entry in reference/tables.yml"
    );
    assert_eq!(mine, 22, "hand-written `Code` tables");
    assert_eq!(spec, 7, "generated `Code` tables, all on diagnostics.md");
}

/// Whether a markdown table row's first cell is the literal header `Code`.
fn first_cell_is_code(line: &str) -> bool {
    line.trim_start()
        .strip_prefix('|')
        .and_then(|cells| cells.split_once('|'))
        .is_some_and(|(first, _)| first.trim() == "Code")
}

/// Every name on the excused list is still EARNED by the corpus.
///
/// An excusal nothing hits is a mask: it silently accepts a name the rule
/// would otherwise report. `excused_names` counts DISTINCT names actually hit
/// and the hit set is a subset of the list, so equality with the list's length
/// is exactly "no entry is dead".
#[test]
fn no_excused_name_is_stale() {
    let corpus = corpus();
    let borrowed: Vec<(&str, &str)> = corpus
        .iter()
        .map(|(name, text)| (name.as_str(), text.as_str()))
        .collect();
    let known = Known::of_this_build();
    let (_, census) = audit(&borrowed, &known.vocabulary());

    assert_eq!(
        census.excused_names,
        crate::reference::pages::excused_len(),
        "an excused name no longer occurs in docs/engine/ — remove it from \
         `prose::EXCUSED` rather than leaving it to mask a future real one"
    );
    // Not vacuous: the list is non-empty and every entry was reached.
    assert!(census.excused_names > 0);
}

#[test]
fn no_generated_table_sits_inside_a_hand_written_section() {
    // What makes the two mechanisms disjoint: `tables` audits what it splices
    // between markers, this audits what the pages write themselves, and a
    // marker inside a `## Diagnostics` section would put one table under both.
    for (name, text) in corpus() {
        let mut inside = false;
        for line in text.lines() {
            if line.starts_with("## ") {
                inside = line.trim_end() == "## Diagnostics";
            } else if inside {
                assert!(
                    !line.contains(crate::reference::tables::OPEN),
                    "{name}: a generated table inside the hand-written section"
                );
            }
        }
    }
}
