//! One reference page's data model: the YAML front matter split off the
//! markdown, parsed for the four fields this surface serves, plus the H1
//! title and the body.
//!
//! The page→shape map IS the front matter, so embedding the page embeds the
//! map with it and there is no second artifact to drift. This module is a
//! READER of a file the docs own — unknown front-matter keys (`order`,
//! `keys`) are ignored rather than denied, the way the gallery reader on the
//! example surface is.
//!
//! A page that does not parse is DROPPED rather than panicking: the catalog
//! then falls short of the embedded set, which `super::tests` fails on. That
//! keeps a malformed page a build-time failure while leaving no unwind on
//! the serving path.

use serde::Deserialize;

/// The front-matter delimiter, opening and closing.
const FENCE: &str = "---\n";

/// One page, ready to serve.
pub(crate) struct Page {
    /// File stem, which is also the page's address (`shojiku://reference/box`).
    pub(crate) stem: &'static str,
    /// The front matter's `group` — how the reference index buckets the page.
    pub(crate) group: String,
    /// The front matter's one-line `summary`.
    pub(crate) summary: String,
    /// The catalog `$defs` names this page documents, in declared order.
    pub(crate) shapes: Vec<String>,
    /// The H1 heading text, markdown as authored.
    pub(crate) title: String,
    /// The markdown after the front matter — a byte-for-byte suffix of the
    /// source file.
    pub(crate) body: &'static str,
}

/// The `reference:` block, read for the fields this surface serves.
#[derive(Deserialize)]
struct FrontMatter {
    reference: Meta,
}

#[derive(Deserialize)]
struct Meta {
    group: String,
    summary: String,
    /// Absent on the 11 pages whose keys the catalog names no shape for
    /// (the index, `diagnostics`, and the item pages documented inline).
    #[serde(default)]
    shapes: Vec<String>,
}

/// Parses one embedded page. `None` = no front matter, front matter that
/// does not carry the four fields, an empty `summary`, or no H1.
pub(crate) fn parse(stem: &'static str, source: &'static str) -> Option<Page> {
    let (front, body) = split(source)?;
    let meta = serde_yaml::from_str::<FrontMatter>(front).ok()?.reference;
    if meta.summary.trim().is_empty() {
        return None;
    }
    Some(Page {
        stem,
        group: meta.group,
        summary: meta.summary,
        shapes: meta.shapes,
        title: title(body)?,
        body,
    })
}

/// Splits `---`-fenced front matter off the markdown. The body keeps every
/// byte after the closing fence except the blank line separating them, so it
/// is a suffix of the file and can be compared to it byte for byte.
fn split(source: &str) -> Option<(&str, &str)> {
    let rest = source.strip_prefix(FENCE)?;
    let (front, body) = rest.split_once("\n---\n")?;
    Some((front, body.trim_start_matches('\n')))
}

/// The first `# ` heading's text.
fn title(body: &str) -> Option<String> {
    body.lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(str::to_string)
        .filter(|t| !t.is_empty())
}

#[cfg(test)]
mod tests;
