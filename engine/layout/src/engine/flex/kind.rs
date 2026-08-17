//! `FlexKind`: the classification of a box child into the atom kinds that
//! participate in flex/grid placement, plus the authored-box accessor both
//! the planning pre-pass and the walk read it through.

use shojiku_core::{
    CharGridItem, CheckboxItem, ContainerItem, EllipseItem, ImageItem, Item, ListItem, OptBox,
    QrCodeItem, RectItem, TableItem, TextItem,
};

/// A flex/grid-participating child: one of the box-atom kinds, authored
/// without `box.x` / `box.y`.
///
/// `Copy` because it is nothing but a borrowed tag: the planning passes
/// hold a slice of them and hand the same child to a parked measure and
/// then to the real placement.
#[derive(Clone, Copy)]
pub(in crate::engine) enum FlexKind<'i> {
    Text(&'i TextItem),
    Rect(&'i RectItem),
    Image(&'i ImageItem),
    Container(&'i ContainerItem),
    QrCode(&'i QrCodeItem),
    List(&'i ListItem),
    CharGrid(&'i CharGridItem),
    Table(&'i TableItem),
    Ellipse(&'i EllipseItem),
    Checkbox(&'i CheckboxItem),
}

impl<'i> FlexKind<'i> {
    /// Classifies a child: `Some` participates in flex/grid placement.
    /// Lines (point-based) and the warn+skip kinds (`page_number` /
    /// `repeat`) always take the absolute path.
    pub(in crate::engine) fn of(item: &'i Item) -> Option<Self> {
        let no_xy = |b: Option<&OptBox>| b.is_none_or(|b| b.x.is_none() && b.y.is_none());
        match item {
            Item::Text(t) if no_xy(t.box_.as_ref()) => Some(FlexKind::Text(t)),
            Item::Rect(r) if no_xy(Some(&r.box_)) => Some(FlexKind::Rect(r)),
            Item::Image(i) if no_xy(i.box_.as_ref()) => Some(FlexKind::Image(i)),
            Item::Container(c) if no_xy(c.box_.as_ref()) => Some(FlexKind::Container(c)),
            Item::QrCode(q) if no_xy(q.box_.as_ref()) => Some(FlexKind::QrCode(q)),
            Item::List(l) if no_xy(l.box_.as_ref()) => Some(FlexKind::List(l)),
            Item::CharGrid(g) if no_xy(g.box_.as_ref()) => Some(FlexKind::CharGrid(g)),
            Item::Table(t) if no_xy(t.box_.as_ref()) => Some(FlexKind::Table(t)),
            Item::Ellipse(e) if no_xy(e.box_.as_ref()) => Some(FlexKind::Ellipse(e)),
            Item::Checkbox(c) if no_xy(c.box_.as_ref()) => Some(FlexKind::Checkbox(c)),
            _ => None,
        }
    }

    /// The child's authored box (`repeat`-style defaulting).
    pub(in crate::engine) fn box_(&self) -> OptBox {
        match self {
            FlexKind::Text(t) => t.box_.clone().unwrap_or_default(),
            FlexKind::Rect(r) => r.box_.clone(),
            FlexKind::Image(i) => i.box_.clone().unwrap_or_default(),
            FlexKind::Container(c) => c.box_.clone().unwrap_or_default(),
            FlexKind::QrCode(q) => q.box_.clone().unwrap_or_default(),
            FlexKind::List(l) => l.box_.clone().unwrap_or_default(),
            FlexKind::CharGrid(g) => g.box_.clone().unwrap_or_default(),
            FlexKind::Table(t) => t.box_.clone().unwrap_or_default(),
            FlexKind::Ellipse(e) => e.box_.clone().unwrap_or_default(),
            FlexKind::Checkbox(c) => c.box_.clone().unwrap_or_default(),
        }
    }
}
