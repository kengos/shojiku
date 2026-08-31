//! The drift gate, over the REAL data.
//!
//! Everything else in this directory is synthetic, because a rule's failure
//! legs have to be reachable. This file is the opposite claim: that the
//! committed spec, the committed catalog and the committed markdown all still
//! agree — which is what a reader of `docs/engine/` is trusting.
//!
//! It reads the pages off disk the way the CLI suite reads `examples/`, and it
//! lives in the DEFAULT suite so `engine:test` and the coverage run both see
//! it — not only `make reference:check`.

use crate::reference::tables::{audit, page, pages, parse, Inputs, Registry};
use crate::reference::{CATALOG, TABLES};
use serde_json::Value;
use shojiku_diagnostics::DiagnosticCode;
use std::collections::BTreeSet;
use std::path::PathBuf;

fn docs() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/engine")
}

fn catalog() -> Value {
    serde_json::from_str(CATALOG).expect("the committed catalog is valid JSON")
}

/// Every code the engine can emit, paired with the wire spelling of its
/// severity — the same `snake_case` the JSON output uses, so the reference's
/// column and a real diagnostic say the same word.
fn registry() -> Registry {
    DiagnosticCode::ALL
        .iter()
        .map(|code| {
            let severity = serde_json::to_value(code.severity())
                .ok()
                .and_then(|v| v.as_str().map(str::to_owned))
                .expect("Severity serializes as a string");
            (code.as_str().to_owned(), severity)
        })
        .collect()
}

fn codes() -> BTreeSet<String> {
    DiagnosticCode::ALL
        .iter()
        .map(|c| c.as_str().to_owned())
        .collect()
}

#[test]
fn the_spec_and_the_catalog_agree() {
    let spec = parse(TABLES).expect("the committed spec parses");
    let problems: Vec<String> = audit(&catalog(), &spec, &codes())
        .iter()
        .map(ToString::to_string)
        .collect();
    assert!(
        problems.is_empty(),
        "the reference tables and the wire have drifted:\n  {}",
        problems.join("\n  ")
    );
}

#[test]
fn every_page_is_what_the_generator_would_write() {
    // The drift half. `make reference:generate` writes exactly this, so a
    // hand-edit inside a generated block fails here rather than surviving as
    // a table nothing regenerates.
    let spec = parse(TABLES).expect("the committed spec parses");
    let registry = registry();
    let inputs = Inputs {
        spec: &spec,
        registry: &registry,
    };
    let stems = pages(&spec);
    assert_eq!(stems.len(), 24, "the spec covers 24 pages");
    for stem in &stems {
        let path = docs().join(format!("{stem}.md"));
        let text =
            std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        match page(stem, &text, &inputs) {
            Ok(regenerated) => {
                assert!(
                    regenerated == text,
                    "{}",
                    first_difference(stem, &text, &regenerated)
                );
            }
            Err(errors) => {
                let rendered: Vec<String> = errors.iter().map(ToString::to_string).collect();
                panic!(
                    "{stem}.md could not be generated:\n  {}",
                    rendered.join("\n  ")
                );
            }
        }
    }
}

#[test]
fn the_spec_covers_every_registry_code() {
    // Stated separately from the audit so the count is visible: a code added
    // to the enum and to no table is the drift this exists to catch.
    let spec = parse(TABLES).expect("the committed spec parses");
    let documented: BTreeSet<String> = spec
        .values()
        .filter(|t| t.page == "diagnostics")
        .flat_map(|t| t.rows.iter().flat_map(|r| r.keys.iter().cloned()))
        .collect();
    assert_eq!(
        documented,
        codes(),
        "diagnostics.md and the registry differ"
    );
    assert_eq!(documented.len(), 157, "the registry is 157 codes");
}

#[test]
fn every_rendered_row_really_has_its_headers_cell_count() {
    // The invariant asserted over the RENDERED BYTES of all 35 tables, not
    // over the spec. The spec-level check below says every cell has a source;
    // this says the markdown that reaches a reader has one cell per column —
    // which is the property `diagnostics.md` did not have, and the one a
    // reader is actually affected by.
    //
    // Counts UNESCAPED bars: `\|` is a character of content, so counting every
    // `|` would bill the escape and report a row with an alternation as one
    // cell too wide.
    fn bars(line: &str) -> usize {
        let chars: Vec<char> = line.chars().collect();
        (0..chars.len())
            .filter(|&i| chars[i] == '|' && (i == 0 || chars[i - 1] != '\\'))
            .count()
    }
    let spec = parse(TABLES).expect("the committed spec parses");
    let registry = registry();
    let mut checked = 0;
    for (id, table) in &spec {
        let body = crate::reference::tables::render(id, table, &registry)
            .unwrap_or_else(|e| panic!("{id}: {e:?}"));
        let width = bars(body.lines().next().expect("a header"));
        assert_eq!(width, table.columns.len() + 1, "{id}: header width");
        for line in body.lines() {
            assert_eq!(bars(line), width, "{id}: {line}");
        }
        checked += 1;
    }
    assert_eq!(
        checked, 35,
        "every committed table was rendered and checked"
    );
}

#[test]
fn regenerating_is_idempotent_on_every_page() {
    // The determinism the catalog already claims, for the tables: nothing here
    // reads the clock, the filesystem or the environment, so two runs agree.
    // Without this the drift gate could pass on one run and fail on the next
    // for reasons nobody could reproduce.
    let spec = parse(TABLES).expect("the committed spec parses");
    let registry = registry();
    let inputs = Inputs {
        spec: &spec,
        registry: &registry,
    };
    // Every page, not one: a splice that is idempotent on `image.md` and not
    // on `diagnostics.md` would leave the drift gate flapping on whichever
    // page ran second. Named IDEMPOTENCE rather than determinism, which is a
    // different claim — that two runs from the same input agree — and is what
    // `the_spec_and_the_catalog_agree` plus the byte-comparison already give.
    let stems = pages(&spec);
    assert_eq!(stems.len(), 24);
    for stem in &stems {
        let text =
            std::fs::read_to_string(docs().join(format!("{stem}.md"))).expect("a readable page");
        let once = page(stem, &text, &inputs).expect("renders");
        let twice = page(stem, &once, &inputs).expect("renders");
        assert_eq!(once, twice, "{stem}.md");
    }
}

#[test]
fn a_grouped_row_covers_every_key_it_names() {
    // `box.w` / `box.h` is ONE row naming two keys, and the audit must count
    // both — otherwise a page that groups its keys would report the second of
    // every pair as undocumented. The committed spec's clean audit depends on
    // this, so it is asserted directly rather than left implicit.
    let spec = parse(TABLES).expect("the committed spec parses");
    let grouped: usize = spec
        .values()
        .flat_map(|t| t.rows.iter())
        .filter(|r| r.keys.len() > 1)
        .count();
    assert!(
        grouped > 10,
        "the doc set really does group rows ({grouped})"
    );
    assert_eq!(
        audit(&catalog(), &spec, &codes()),
        vec![],
        "and every key of every grouped row counts as covered"
    );
}

#[test]
fn every_generated_row_has_its_headers_cell_count() {
    // The invariant the hand-written tables did not have: nine rows of
    // `diagnostics.md` carried a cell past the header's count, and GFM drops
    // those, so nine codes' meanings were invisible on the rendered site.
    let spec = parse(TABLES).expect("the committed spec parses");
    for (id, table) in &spec {
        let width = table.columns.len();
        for row in &table.rows {
            for column in &table.columns {
                assert!(
                    row.cells.contains_key(&column.header)
                        || !matches!(column.from, crate::reference::tables::Cell::Authored),
                    "{id}: row `{}` has no `{}`",
                    row.keys.first().map_or("", String::as_str),
                    column.header
                );
            }
        }
        assert!(width >= 2, "{id}: a table needs at least two columns");
    }
}

/// Where two versions of a page first differ, as a message a reader can act on.
///
/// `assert_eq!` over two 20 KB strings prints both in full and buries the one
/// line that moved, which makes the gate technically correct and practically
/// unusable. This names the line and shows the pair.
fn first_difference(stem: &str, committed: &str, generated: &str) -> String {
    let pair = committed
        .lines()
        .zip(generated.lines())
        .enumerate()
        .find(|(_, (a, b))| a != b);
    match pair {
        Some((i, (a, b))) => format!(
            "{stem}.md line {} differs — run `make reference:generate`\n  committed: {a:?}\n  generated: {b:?}",
            i + 1
        ),
        None => format!(
            "{stem}.md differs in LENGTH ({} committed lines, {} generated) — run `make reference:generate`",
            committed.lines().count(),
            generated.lines().count()
        ),
    }
}
