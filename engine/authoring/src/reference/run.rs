//! What `reference-gen` DOES, as a function a test can drive.
//!
//! The binary is wiring: it builds a [`Job`] from two compile-time constants
//! and maps a [`Refusal`] onto stderr and an exit code. Everything that can be
//! wrong lives here, because a binary's `main` is outside every gate this repo
//! has — `required-features` keeps it out of the coverage build, and nothing
//! executes it — so an ORDERING that lives in `main` is asserted by nobody.
//!
//! **The order is the point, and it is now two claims, not one.**
//!
//! 1. The hand-written `## Diagnostics` sections are audited BEFORE anything is
//!    written, so a page naming a retired code stops the run with the tree
//!    untouched instead of surfacing after a partial rewrite.
//! 2. Every output is COMPUTED before any is written. Auditing first fixed only
//!    the first stage; a table that could not be rendered still aborted the run
//!    part-way through the page loop, leaving exactly the half-regenerated tree
//!    the audit-first rule exists to prevent. [`tables::page`] is pure, so
//!    computing the whole set costs nothing but a `Vec`.
//!
//! So a CONTENT refusal — a stale code, an unrenderable table, a spec that
//! does not parse — writes nothing at all, and that is what [`tests`] pins: an
//! exit code alone is equally consistent with "refused" and "failed halfway
//! through". [`Refusal::Io`] is deliberately NOT covered by that: a write that
//! fails midway through the loop leaves what it already wrote, and no test
//! claims otherwise. Bounding THAT would need a temp-and-rename commit, which
//! is more machinery than a developer-only generator earns.
//!
//! **Where it writes is the caller's, and that is not a widening.** The binary
//! still takes no arguments and reads no environment: it passes
//! [`super::CATALOG_PATH`] and a `CARGO_MANIFEST_DIR`-rooted docs root, both
//! compile-time constants. A [`Job`] carrying paths is a library argument like
//! `fs::write`'s, and this module is behind the non-default `schema` feature,
//! which no host builds — so there is no surface on which a caller-supplied
//! path could steer a write.

use super::generate;
use super::pages::{self, Known};
use super::tables::{self, page as render_page, pages as spec_pages, parse as parse_spec, Inputs};
use std::fmt;
use std::path::{Path, PathBuf};

/// Where one run reads and writes, and the spec it renders from.
///
/// Held as a struct so the binary and the tests pass the SAME shape; the
/// binary's values are compile-time constants (see the module header).
pub struct Job<'a> {
    /// The key catalog's committed path.
    pub catalog: &'a Path,
    /// The directory holding the reference pages (`<stem>.md`).
    pub docs: &'a Path,
    /// The table spec's source — [`super::TABLES`] for the real run.
    pub tables: &'a str,
}

/// Why a run wrote nothing.
///
/// Every variant is raised BEFORE the first write, which is what lets the
/// caller report "refused" rather than "failed part-way".
#[derive(Debug)]
pub enum Refusal {
    /// A hand-written diagnostics section names something the engine does not
    /// define. Rendered, not structured: the only consumer prints them, and
    /// keeping this signature free of [`super::pages`] types means widening a
    /// `Problem` is not a change to this crate's published API. (Narrowing
    /// those modules to `pub(crate)` was tried and reverted — it turns 17
    /// gate-serving items into dead code; see `docs/code-map/hosts.md`.)
    Pages(Vec<String>),
    /// The table spec itself does not parse.
    Spec(String),
    /// A page's tables could not be rendered or spliced.
    Tables {
        /// The page's stem, as the spec names it.
        page: String,
        /// Every problem on that page, not just the first.
        errors: Vec<String>,
    },
    /// A file could not be read, or a write failed after the refusal-free
    /// point. An environment failure, not a refusal about content.
    Io {
        /// What was being read or written.
        path: PathBuf,
        /// The underlying error.
        error: std::io::Error,
    },
}

impl fmt::Display for Refusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pages(problems) => {
                for problem in problems {
                    writeln!(f, "{problem}")?;
                }
                write!(f, "nothing was written")
            }
            Self::Spec(error) => write!(f, "the table spec does not parse: {error}"),
            Self::Tables { page, errors } => {
                for error in errors {
                    writeln!(f, "{page}.md: {error}")?;
                }
                write!(f, "nothing was written")
            }
            Self::Io { path, error } => write!(f, "{}: {error}", path.display()),
        }
    }
}

/// What a successful run did.
///
/// The audit numbers are flattened out of `pages::Census` rather than carried
/// as it: the caller wants three numbers to print, and this keeps the
/// generator's signature independent of the audit modules. They are here at
/// all because an inert scan reports zero problems too, so "no problems" is
/// only evidence beside the population it read.
#[derive(Debug)]
pub struct Outcome {
    /// `## Diagnostics` sections found.
    pub sections: usize,
    /// Column-1 code claims judged against the registry.
    pub occurrences: usize,
    /// Other in-section tokens judged against the three lookups.
    pub checked: usize,
    /// Every path written, in write order.
    pub written: Vec<PathBuf>,
}

/// Audits, then regenerates — writing nothing unless everything succeeded.
///
/// # Errors
///
/// [`Refusal`], and in every content case the tree is byte-identical to what
/// it was on entry.
pub fn run(job: &Job<'_>) -> Result<Outcome, Refusal> {
    // Auditing first is safe because the splice can never touch a byte this
    // reads: no marker sits inside a `## Diagnostics` section, which
    // `no_generated_table_sits_inside_a_hand_written_section` pins, and the
    // vocabulary is compile-time regardless. Without that, reading the pages
    // BEFORE regenerating them would be auditing a stale tree.
    let audited = audit_pages(job.docs)?;
    let spec = parse_spec(job.tables).map_err(|error| Refusal::Spec(error.to_string()))?;
    let registry = tables::registry();
    let inputs = Inputs {
        spec: &spec,
        registry: &registry,
    };

    // Compute every byte before writing any of it: the loop below still
    // refuses (a missing page, an unrenderable table), and that is the point —
    // it refuses with the tree untouched.
    let mut pending: Vec<(PathBuf, String)> = vec![(job.catalog.to_path_buf(), generate())];
    for stem in spec_pages(&spec) {
        let path = job.docs.join(format!("{stem}.md"));
        let text = read(&path)?;
        let next = render_page(&stem, &text, &inputs).map_err(|errors| Refusal::Tables {
            page: stem.clone(),
            errors: errors.iter().map(ToString::to_string).collect(),
        })?;
        if next != text {
            pending.push((path, next));
        }
    }

    // Past this point nothing refuses about CONTENT. A write can still fail,
    // and if one does after an earlier write succeeded the tree IS partly
    // rewritten — see the module header.
    let mut written = Vec::with_capacity(pending.len());
    for (path, bytes) in pending {
        std::fs::write(&path, bytes).map_err(|error| Refusal::Io {
            path: path.clone(),
            error,
        })?;
        written.push(path);
    }
    Ok(Outcome {
        sections: audited.sections,
        occurrences: audited.occurrences,
        checked: audited.checked,
        written,
    })
}

/// Every `.md` under `docs`, held to this build's registries.
fn audit_pages(docs: &Path) -> Result<pages::Census, Refusal> {
    let mut paths: Vec<PathBuf> = read_dir(docs)?
        .into_iter()
        .filter(|path| path.extension().is_some_and(|ext| ext == "md"))
        .collect();
    paths.sort();
    let mut corpus: Vec<(String, String)> = Vec::with_capacity(paths.len());
    for path in paths {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_owned();
        corpus.push((name, read(&path)?));
    }
    let borrowed: Vec<(&str, &str)> = corpus
        .iter()
        .map(|(name, text)| (name.as_str(), text.as_str()))
        .collect();
    let known = Known::of_this_build();
    let (problems, census) = pages::audit(&borrowed, &known.vocabulary());
    if problems.is_empty() {
        Ok(census)
    } else {
        Err(Refusal::Pages(
            problems.iter().map(ToString::to_string).collect(),
        ))
    }
}

fn read(path: &Path) -> Result<String, Refusal> {
    std::fs::read_to_string(path).map_err(|error| Refusal::Io {
        path: path.to_path_buf(),
        error,
    })
}

fn read_dir(dir: &Path) -> Result<Vec<PathBuf>, Refusal> {
    let entries = std::fs::read_dir(dir).map_err(|error| Refusal::Io {
        path: dir.to_path_buf(),
        error,
    })?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| Refusal::Io {
            path: dir.to_path_buf(),
            error,
        })?;
        out.push(entry.path());
    }
    Ok(out)
}

#[cfg(test)]
mod tests;
