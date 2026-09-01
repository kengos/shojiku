//! The page catalog, and the two drift gates that keep it honest: the
//! embedded set against the real `docs/engine/` tree, and every page's
//! declared shapes against the key catalog.
//!
//! The gates are the point of this file. A hand-written table beside a
//! growing reference drifts the first time someone adds a page, and a
//! reference an agent TRUSTS is worse than none at all — so the table is
//! asserted against the directory in both directions, and the page→shape
//! map is asserted to be an exact partition of the catalog's `$defs`.

use super::*;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

/// The repo-root `docs/engine/` tree, located the way every other test in
/// the workspace locates a fixture.
fn reference_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/engine")
}

/// The one page deliberately not served: the development-facing inventory
/// and decision log, which is not authorable syntax.
const EXCLUDED: &[&str] = &["features"];

/// The closed set of front-matter groups. A new group is a deliberate
/// editorial decision on the reference's shape, so it fails here first.
const GROUPS: &[&str] = &[
    "index",
    "item-keys",
    "item",
    "concept",
    "root",
    "definitions",
    "layout",
];

/// The largest RESPONSE a single reference page may answer with: its
/// markdown body plus the serialized schema half, which together are what
/// `resources/read` hands back.
///
/// A BUILD-time bound, not a runtime one. `resources/read` serves a page in
/// full — it has no way to serve half of one — so a runtime refusal would
/// just make that page unreachable. Asserting it over the compiled-in
/// corpus instead means an oversized page fails here, before it can ship.
///
/// **The reference family's OWN bound, deliberately above the example
/// family's `MAX_ENTRY_BYTES` (64 KiB)**, because the two bound different
/// things: an example bundle must be read WHOLE to be usable and an
/// over-cap one has per-file URIs to be sent to instead, while a reference
/// page is a document a client reads once and works from, with no per-file
/// spelling to fall back to.
///
/// Today's largest response is `shojiku://reference/template` at ~68 KiB —
/// pinned by name below, because it is counter-intuitive and is why this
/// gate weighed the wrong quantity until it was corrected. `template.md` is
/// a 6 KiB file, but it declares eight shapes including `Item`, so its
/// schema half alone is ~62 KiB; `diagnostics.md`, the largest FILE at
/// ~23 KiB, declares none and answers ~23 KiB. File size says nothing about
/// response size.
const MAX_REFERENCE_BYTES: usize = 96 * 1024;

/// The longest selector any page can be asked for today, in characters.
/// Quoted in `uri::MAX_FRAGMENT`'s doc comment, so the test below holds the
/// two in step: a catalog rename that outgrows the sentence fails here
/// rather than leaving the sentence quietly false.
const LONGEST_SELECTOR: usize = 30;

/// Every markdown stem on disk.
fn on_disk_stems() -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    for entry in std::fs::read_dir(reference_dir()).expect("docs/engine is readable") {
        let path = entry.expect("dir entry").path();
        if path.extension().is_some_and(|e| e == "md") {
            let stem = path
                .file_stem()
                .expect("stem")
                .to_string_lossy()
                .into_owned();
            found.insert(stem);
        }
    }
    found
}

/// The key catalog's `$defs` names.
fn catalog_defs() -> BTreeSet<String> {
    let schema: Value =
        serde_json::from_str(shojiku_authoring::reference::CATALOG).expect("catalog parses");
    schema["$defs"]
        .as_object()
        .expect("$defs")
        .keys()
        .cloned()
        .collect()
}

#[test]
fn the_embedded_set_matches_the_reference_tree_exactly() {
    let on_disk = on_disk_stems();
    // Positive control: the walk found the tree at all. A gate that comes
    // back empty must fail loudly rather than pass vacuously.
    assert!(
        on_disk.len() > 20,
        "the docs/engine walk found only {} pages — it is measuring the wrong directory",
        on_disk.len()
    );

    let expected: BTreeSet<String> = on_disk
        .iter()
        .filter(|stem| !EXCLUDED.contains(&stem.as_str()))
        .cloned()
        .collect();
    let embedded: BTreeSet<String> = embed::PAGES.iter().map(|p| p.stem.to_string()).collect();
    assert_eq!(
        embedded,
        expected,
        "the embedded table and docs/engine disagree: \
         missing from the table {:?}, listed but not on disk {:?}",
        expected.difference(&embedded).collect::<Vec<_>>(),
        embedded.difference(&expected).collect::<Vec<_>>()
    );

    // The exclusion is a real page, not a typo that silently excludes
    // nothing.
    for excluded in EXCLUDED {
        assert!(
            on_disk.contains(*excluded),
            "{excluded} is excluded but does not exist"
        );
    }
}

#[test]
fn every_embedded_page_parses_and_reaches_the_catalog() {
    // The count is what proves nothing was dropped: `build` filters out a
    // page it cannot parse, so a malformed page shows up here rather than
    // as a quietly shorter catalog.
    assert_eq!(catalog().len(), embed::PAGES.len());
    assert_eq!(catalog().len(), 33);
}

#[test]
fn every_embedded_page_matches_the_file_on_disk() {
    let root = reference_dir();
    for page in embed::PAGES {
        let disk = std::fs::read_to_string(root.join(format!("{}.md", page.stem)))
            .expect("page is readable");
        assert_eq!(
            page.source, disk,
            "embedded {} differs from disk",
            page.stem
        );
    }
}

#[test]
fn every_page_carries_the_front_matter_the_surface_serves() {
    for page in catalog() {
        assert!(
            GROUPS.contains(&page.group.as_str()),
            "{} declares group {:?}, outside the closed set",
            page.stem,
            page.group
        );
        assert!(
            !page.summary.trim().is_empty(),
            "{} has no summary",
            page.stem
        );
        assert!(!page.title.is_empty(), "{} has no H1", page.stem);
        // The body is a byte-for-byte SUFFIX of the file: the split takes
        // the front matter and nothing else.
        let source = embed::PAGES
            .iter()
            .find(|p| p.stem == page.stem)
            .expect("embedded")
            .source;
        assert!(
            source.ends_with(page.body),
            "{} body is not a suffix",
            page.stem
        );
        assert!(
            page.body.starts_with("# "),
            "{} body starts {:?}",
            page.stem,
            &page.body[..page.body.len().min(20)]
        );
        assert!(
            !page.body.contains("reference:\n  group:"),
            "{} kept its front matter",
            page.stem
        );
    }
}

#[test]
fn the_declared_shapes_partition_the_key_catalog() {
    let defs = catalog_defs();
    // Positive control: the catalog was read at all.
    assert_eq!(defs.len(), 84, "the key catalog's shape count moved");

    let mut owner: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for page in catalog() {
        for shape in &page.shapes {
            owner.entry(shape.as_str()).or_default().push(page.stem);
        }
    }
    let claimed: BTreeSet<String> = owner.keys().map(|s| (*s).to_string()).collect();
    assert_eq!(
        claimed,
        defs,
        "unclaimed shapes {:?}, claimed but undefined {:?}",
        defs.difference(&claimed).collect::<Vec<_>>(),
        claimed.difference(&defs).collect::<Vec<_>>()
    );
    let shared: Vec<_> = owner.iter().filter(|(_, pages)| pages.len() > 1).collect();
    assert!(shared.is_empty(), "shapes claimed by two pages: {shared:?}");
}

#[test]
fn no_page_response_exceeds_the_build_time_size_bound() {
    // Measured at the CONSUMER: both parts, in the serialization
    // `resources::reference::read_page` uses. Weighing the `.md` file
    // instead measures a quantity that does not correlate with what is
    // served — see the bound's own doc comment.
    let mut largest = (0_usize, "");
    for page in catalog() {
        let served = page.body.len() + crate::tools::json_text(&nodes::defs(page)).len();
        assert!(
            served <= MAX_REFERENCE_BYTES,
            "{} answers {served} bytes, over the {MAX_REFERENCE_BYTES}-byte bound — \
             split the page or narrow the shapes it claims",
            page.stem
        );
        if served > largest.0 {
            largest = (served, page.stem);
        }
    }
    // The bound's doc comment names the largest page; this is what holds
    // that sentence true, and doubles as the positive control that the walk
    // measured the real corpus rather than an empty one.
    assert_eq!(largest.1, "template", "the largest response changed pages");
    assert!(largest.0 > 60_000, "largest response was {} B", largest.0);
}

#[test]
fn every_addressable_selector_fits_the_fragment_bound() {
    // `MAX_FRAGMENT` bounds a client-supplied string; this measures the
    // longest string a client could legitimately send, which is what says
    // whether the bound is headroom or a limit.
    let schema: Value =
        serde_json::from_str(shojiku_authoring::reference::CATALOG).expect("catalog parses");
    let defs = schema["$defs"].as_object().expect("$defs");
    let mut longest = (0_usize, String::new());
    for page in catalog() {
        for shape in &page.shapes {
            let mut selectors = vec![shape.clone()];
            if let Some(props) = defs[shape.as_str()]
                .get("properties")
                .and_then(Value::as_object)
            {
                selectors.extend(props.keys().map(|key| format!("{shape}.{key}")));
            }
            for selector in selectors {
                let len = selector.chars().count();
                assert!(
                    uri::parse(&uri::fragment_uri(page.stem, &selector)).is_some(),
                    "{selector} is addressable but does not parse"
                );
                if len > longest.0 {
                    longest = (len, selector);
                }
            }
        }
    }
    assert!(longest.0 <= uri::MAX_FRAGMENT);
    assert_eq!(
        longest.0, LONGEST_SELECTOR,
        "the longest selector is now {:?} at {} chars — update the count in \
         `uri::MAX_FRAGMENT`'s doc comment",
        longest.1, longest.0
    );
}

#[test]
fn find_answers_none_for_an_unknown_stem() {
    assert!(find("box").is_some());
    assert!(find("features").is_none(), "the excluded page stays out");
    assert!(find("no-such-page").is_none());
    assert!(find("BOX").is_none(), "stems match exactly");
}
