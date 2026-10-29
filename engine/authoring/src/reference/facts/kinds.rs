//! Which catalog values carry a meaning their JSON type does not say: a
//! string that is a colour, a number that is a fraction of one.

/// What a value is, beyond its JSON type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    /// An `#rrggbb` colour string.
    Color,
    /// A number from 0 to 1, a share of the whole (paint alpha).
    Fraction,
}

impl ValueKind {
    /// The `x-shojiku-value-kind` value.
    pub fn as_str(self) -> &'static str {
        match self {
            ValueKind::Color => "color",
            ValueKind::Fraction => "fraction",
        }
    }
}

/// Every node that carries a value kind. A border colour is marked on each
/// of its forms' strings — the one colour for all sides and each side of
/// the per-side map — rather than on the union, which is not one colour.
pub const NAMED: [(&str, ValueKind); 10] = [
    ("Style.color", ValueKind::Color),
    ("Style.backgroundColor", ValueKind::Color),
    ("BorderColor.@string", ValueKind::Color),
    ("BorderColor.top", ValueKind::Color),
    ("BorderColor.right", ValueKind::Color),
    ("BorderColor.bottom", ValueKind::Color),
    ("BorderColor.left", ValueKind::Color),
    ("LineStyle.color", ValueKind::Color),
    ("Style.opacity", ValueKind::Fraction),
    ("LineStyle.opacity", ValueKind::Fraction),
];
