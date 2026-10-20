//! Where a template's items live: the header band, the body and the
//! footer band, each with the template path its diagnostics are addressed
//! under. The walks over "all the items" in `validate` and in
//! `engine/image`'s asset preparation start here, so none of them can
//! cover the body and forget the bands that layout also draws. (Validate's
//! box-key walk spells the three out itself: it needs the body's KIND,
//! which this list does not carry.) The step below the top level is
//! [`Item::child_lists`].

use super::{Body, Item, Sections};

#[cfg(test)]
mod tests;

impl Body {
    /// The body's top-level items, whichever kind of body it is.
    pub fn items(&self) -> &[Item] {
        match self {
            Body::Flow(flow) => &flow.items,
            Body::Absolute(abs) => &abs.items,
        }
    }
}

impl Sections {
    /// The top-level item list of each section that is present, in
    /// document order (header, body, footer), with its path prefix
    /// (`sections.header.items`, …). An absent band is skipped.
    pub fn item_lists(&self) -> Vec<(&'static str, &[Item])> {
        let header = self
            .header
            .as_ref()
            .map(|h| ("sections.header.items", &h.items[..]));
        let footer = self
            .footer
            .as_ref()
            .map(|f| ("sections.footer.items", &f.items[..]));
        header
            .into_iter()
            .chain([("sections.body.items", self.body.items())])
            .chain(footer)
            .collect()
    }
}
