//! The markdown SHAPE of every reference page, generated or not.
//!
//! Split from `committed.rs` for the line budget. It belongs beside it: the
//! drift gate proves the generated blocks are what the generator would write,
//! and this proves the property those blocks have BY CONSTRUCTION holds on the
//! hand-written tables around them too — which is where the defect this whole
//! change exists to remove actually happened.

use std::path::PathBuf;

fn docs() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/engine")
}

#[test]
fn no_table_anywhere_in_the_reference_is_over_wide() {
    // The generated blocks cannot produce an over-wide row by construction.
    // This is the rest of `docs/engine/` — the 22 hand-written per-page
    // `Code | Meaning` tables D9 deliberately left authored, and every other
    // hand-written table on those pages.
    //
    // Without it the claim "a row can no longer carry a cell its header drops"
    // is true only inside the 35 generated blocks, and the defect this change
    // exists to remove had already happened once in exactly this class.
    fn cells(line: &str) -> usize {
        let chars: Vec<char> = line.chars().collect();
        (0..chars.len())
            .filter(|&i| chars[i] == '|' && (i == 0 || chars[i - 1] != '\\'))
            .count()
    }
    let mut tables = 0;
    let mut offenders = Vec::new();
    let dir = std::fs::read_dir(docs()).expect("docs/engine is readable");
    for entry in dir {
        let path = entry.expect("a readable entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_owned();
        let text = std::fs::read_to_string(&path).expect("a readable page");
        let mut fence: Option<String> = None;
        let mut header: Option<usize> = None;
        for (n, line) in text.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                let tok = trimmed
                    .chars()
                    .take_while(|c| *c == '`' || *c == '~')
                    .collect::<String>();
                match &fence {
                    Some(open) if tok.starts_with(open.as_str()) => fence = None,
                    Some(_) => {}
                    None => fence = Some(tok),
                }
                header = None;
                continue;
            }
            if fence.is_some() {
                continue;
            }
            if !trimmed.starts_with('|') {
                header = None;
                continue;
            }
            match header {
                None => {
                    header = Some(cells(line));
                    tables += 1;
                }
                Some(width) if cells(line) != width => {
                    offenders.push(format!("{stem}.md:{}", n + 1));
                }
                Some(_) => {}
            }
        }
    }
    // A floor, not a pin: pages gain tables. It cannot pass on an empty sweep,
    // which is the failure this control exists for. The real count is 79 — 35
    // generated plus 44 hand-written — and it agrees with the Phase 0 census
    // of this directory. It is NOT the 103 a sweep over all of `docs/**` plus
    // the root markdown finds; taking that figure for this narrower walk is
    // how this control first failed, which is the control working.
    assert!(
        tables >= 70,
        "the sweep reached the tables (found {tables})"
    );
    assert_eq!(
        offenders,
        Vec::<String>::new(),
        "rows wider than their header"
    );
}
