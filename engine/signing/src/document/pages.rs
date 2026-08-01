//! Finding the page a signature widget attaches to.
//!
//! An invisible signature still needs a page: the widget annotation belongs
//! to one, and a reader that cannot find the field on a page may not show the
//! document as signed at all. The first page is reached by descending the
//! page tree's `/Kids`, bounded by depth so a tree that points back at itself
//! ends in an error rather than a hang.

use super::PdfDocument;
use crate::error::{Result, SigningError};
use crate::limits::MAX_PAGE_TREE_DEPTH;
use crate::object::{array_elements, parse_ref};

/// Returns the object number of the document's first page.
pub(crate) fn first_page(doc: &PdfDocument<'_>) -> Result<u32> {
    let catalog = doc.dict_at(doc.catalog_number())?;
    let pages =
        catalog
            .get_ref(b"Pages", "the catalog's /Pages")?
            .ok_or(SigningError::Malformed {
                offset: 0,
                what: "a catalog /Pages entry",
            })?;
    let mut current = pages.number;
    for _ in 0..MAX_PAGE_TREE_DEPTH {
        let node = doc.dict_at(current)?;
        if node.get(b"Type") == Some(b"/Page".as_slice()) {
            return Ok(current);
        }
        let kids = node.get(b"Kids").ok_or(SigningError::Malformed {
            offset: 0,
            what: "a page tree node's /Kids",
        })?;
        let elements = array_elements(kids, "a page tree node's /Kids")?;
        let first = elements.first().ok_or(SigningError::Malformed {
            offset: 0,
            what: "a non-empty /Kids array",
        })?;
        current = parse_ref(first, "a /Kids entry")?.number;
    }
    Err(SigningError::LimitExceeded {
        what: "page tree depth",
        cap: MAX_PAGE_TREE_DEPTH,
    })
}
