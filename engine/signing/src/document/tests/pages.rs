//! Unit tests for the page-tree descent.

use crate::document::{first_page, PdfDocument};
use crate::error::SigningError;
use crate::limits::MAX_PAGE_TREE_DEPTH;
use crate::testkit::{build_pdf, simple_pdf};

#[test]
fn finds_the_page_under_a_flat_page_tree() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(first_page(&doc), Ok(2));
}

#[test]
fn descends_through_intermediate_nodes() {
    let bytes = build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[4 0 R]>>"),
            (2, "<</Type/Page/Parent 4 0 R>>"),
            (3, "<</Type/Catalog/Pages 1 0 R>>"),
            (4, "<</Type/Pages/Count 1/Kids[2 0 R]/Parent 1 0 R>>"),
        ],
        3,
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(first_page(&doc), Ok(2));
}

#[test]
fn a_catalog_without_pages_is_a_failure() {
    let bytes = build_pdf(&[(1, "<</Type/Catalog>>")], 1);
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(
        first_page(&doc).expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "a catalog /Pages entry"
        }
    );
}

#[test]
fn a_node_that_is_neither_a_page_nor_a_parent_is_a_failure() {
    let bytes = build_pdf(
        &[
            (1, "<</Type/Pages/Count 0>>"),
            (2, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        2,
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(
        first_page(&doc).expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "a page tree node's /Kids"
        }
    );
}

#[test]
fn an_empty_kids_array_is_a_failure() {
    let bytes = build_pdf(
        &[
            (1, "<</Type/Pages/Count 0/Kids[]>>"),
            (2, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        2,
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(
        first_page(&doc).expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "a non-empty /Kids array"
        }
    );
}

#[test]
fn a_kids_entry_that_is_not_a_reference_is_a_failure() {
    let bytes = build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[7]>>"),
            (2, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        2,
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert!(matches!(
        first_page(&doc),
        Err(SigningError::Malformed { .. })
    ));
}

#[test]
fn a_page_tree_exactly_as_deep_as_the_cap_still_resolves() {
    // The last node the cap admits must still be reachable; a tree one level
    // deeper is the failing case below.
    let last = u32::try_from(MAX_PAGE_TREE_DEPTH).expect("a small cap");
    let mut objects: Vec<(u32, String)> = (1..last)
        .map(|number| {
            (
                number,
                format!("<</Type/Pages/Count 1/Kids[{} 0 R]>>", number + 1),
            )
        })
        .collect();
    objects.push((last, "<</Type/Page>>".to_string()));
    objects.push((last + 1, "<</Type/Catalog/Pages 1 0 R>>".to_string()));
    let borrowed: Vec<(u32, &str)> = objects
        .iter()
        .map(|(number, body)| (*number, body.as_str()))
        .collect();

    let bytes = build_pdf(&borrowed, last + 1);
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(
        first_page(&doc),
        Ok(last),
        "the deepest admitted page resolves"
    );
}

#[test]
fn a_page_tree_that_never_reaches_a_page_is_capped() {
    // A node whose /Kids points back at itself would otherwise loop forever.
    let bytes = build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[1 0 R]>>"),
            (2, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        2,
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(
        first_page(&doc).expect_err("fails"),
        SigningError::LimitExceeded {
            what: "page tree depth",
            cap: MAX_PAGE_TREE_DEPTH
        }
    );
}
