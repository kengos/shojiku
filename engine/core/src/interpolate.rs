//! `{key}` / `{key:format}` interpolation inside static text.
//!
//! Static text items may embed bound values: `注文コード: {order.code}` or
//! `合計: {amount.total_in_tax:currency}`. `{{` escapes a literal `{`.

/// One segment of an interpolated string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Segment {
    Literal(String),
    /// A `{key}` or `{key:format}` expression.
    Expr {
        key: String,
        format: Option<String>,
    },
}

fn is_key_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '.'
}

fn is_format_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// Splits `text` into literal and expression segments.
///
/// Malformed expressions (unclosed braces, invalid characters) are kept as
/// literals rather than errors — templates should degrade visibly, not fail.
pub fn parse_segments(text: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut literal = String::new();
    let mut chars = text.chars().peekable();

    while let Some(c) = chars.next() {
        if c != '{' {
            literal.push(c);
            continue;
        }
        if chars.peek() == Some(&'{') {
            chars.next();
            literal.push('{');
            continue;
        }

        // Try to read `key[:format]}` from this point.
        let mut key = String::new();
        let mut format = String::new();
        let mut in_format = false;
        let mut closed = false;
        let mut consumed = String::new();

        for c2 in chars.by_ref() {
            consumed.push(c2);
            match c2 {
                '}' => {
                    closed = true;
                    break;
                }
                ':' if !in_format => in_format = true,
                c2 if !in_format && is_key_char(c2) => key.push(c2),
                c2 if in_format && is_format_char(c2) => format.push(c2),
                _ => {
                    closed = false;
                    break;
                }
            }
        }

        let valid = closed && !key.is_empty() && (!in_format || !format.is_empty());
        if valid {
            if !literal.is_empty() {
                segments.push(Segment::Literal(std::mem::take(&mut literal)));
            }
            segments.push(Segment::Expr {
                key,
                format: if in_format { Some(format) } else { None },
            });
        } else {
            literal.push('{');
            literal.push_str(&consumed);
        }
    }

    if !literal.is_empty() {
        segments.push(Segment::Literal(literal));
    }
    segments
}

/// Whether `name` can be written as `{name}` — the ONE statement of the
/// reference grammar's charset, shared with binding-declaration names so
/// a declaration that could never be referenced is caught at validation.
pub fn is_valid_interpolation_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(is_key_char)
}

/// Longest `{…}` body [`scan_suspect_keys`] reports. A real key is short;
/// a longer run is prose that merely happens to be brace-wrapped, and
/// reporting it would echo unbounded authored content into a diagnostic.
const MAX_SUSPECT_LEN: usize = 64;

/// Collects `{…}` runs that LOOK like an intended interpolation but use
/// characters outside the key charset, so [`parse_segments`] degrades
/// them to literal text and the page silently prints the braces
/// (`{品名}` renders verbatim while the same key bound as `data:` works).
///
/// Deliberately narrow: the body must close with `}`, be non-empty and
/// under [`MAX_SUSPECT_LEN`], hold only key-shaped characters (Unicode
/// alphanumerics plus `_ . : -`), NOT already parse as `key[:format]`,
/// and contain at least one character outside the ASCII charset. So a
/// YAML snippet in a code sample (`{ h: 24 }`), `{a-b}`, `{:fmt}` and
/// every valid expression are left alone. Linear in `text` — the inner
/// scan consumes from the same iterator.
pub fn scan_suspect_keys(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '{' {
            continue;
        }
        if chars.peek() == Some(&'{') {
            chars.next();
            continue;
        }
        let mut body = String::new();
        let (mut closed, mut too_long, mut len) = (false, false, 0usize);
        for c2 in chars.by_ref() {
            if c2 == '}' {
                closed = true;
                break;
            }
            if len >= MAX_SUSPECT_LEN {
                too_long = true;
                continue;
            }
            len += 1;
            body.push(c2);
        }
        if closed && !too_long && is_suspect_key(&body) {
            out.push(body);
        }
    }
    out
}

/// Whether one `{…}` body is a charset-mistake candidate — pure, so every
/// branch is unit-testable without crafting whole templates.
fn is_suspect_key(body: &str) -> bool {
    fn key_shaped(c: char) -> bool {
        c.is_alphanumeric() || matches!(c, '_' | '.' | ':' | '-')
    }
    if body.is_empty() || is_valid_expr(body) {
        return false;
    }
    body.chars().all(key_shaped)
        && body
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && !matches!(c, '_' | '.' | ':' | '-'))
}

/// Whether a body already parses as `key[:format]`, mirroring
/// [`parse_segments`]'s own validity rule — such a body is an expression,
/// not a mistake.
fn is_valid_expr(body: &str) -> bool {
    match body.split_once(':') {
        Some((key, format)) => {
            !key.is_empty()
                && key.chars().all(is_key_char)
                && !format.is_empty()
                && format.chars().all(is_format_char)
        }
        None => !body.is_empty() && body.chars().all(is_key_char),
    }
}

#[cfg(test)]
#[path = "interpolate/tests.rs"]
mod tests;
