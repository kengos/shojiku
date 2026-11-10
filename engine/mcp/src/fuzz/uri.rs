//! The resource URI harness the `mcp_uri` fuzz target and the corpus
//! replay test both run.
//!
//! A client reads a bundled example or a reference page by a
//! `shojiku://example/<bucket>/<name>[/<file>]` or
//! `shojiku://reference/<page>[#<fragment>]` URI, through `resources/read`
//! or the `get_example` and `get_reference` tools. Neither URI ever becomes
//! a filesystem path. The harness reads each input line as one URI and
//! asserts: an accepted URI is rebuilt from its parts to the same string,
//! and each part is non-empty, not `.` or `..`, and drawn from
//! `[A-Za-z0-9._-]` (a reference fragment at most `MAX_FRAGMENT`
//! characters); a URI the parser refuses is answered with invalid params;
//! an accepted URI is answered with its own contents or with resource not
//! found (an example entry also with invalid params when it is over the
//! bundle cap); an error message holds no character the echo guard strips
//! and is at most `MAX_ECHO` + `MAX_FIXED_TEXT` characters long, however
//! long the URI is; the read tool answers what `resources/read` answers;
//! and a second read gives the same answer.

use crate::examples::uri as example;
use crate::reference::uri as reference;
use crate::rpc::INVALID_PARAMS;
use answer::{Answer, assert_code, assert_contents, assert_not_found, assert_tool_parity, read};
use shojiku_diagnostics::{MAX_ECHO, sanitize};

mod answer;
#[cfg(test)]
mod tests;

/// Which assertions one input checked on a result a no-op engine would not
/// give, for the replay test's positive controls. Each flag is set after the
/// assertion it guards passed. The read flags (the four content flags,
/// `over_bundle_cap` and the two not-found flags) and the two malformed
/// flags are set from the engine's own verdict rather than from the URI:
/// an engine missing the branch of one of these flags answers its URIs as
/// another arm, which passes that arm's assertions, and the replay reports
/// it by the flag left unset.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct UriPaths {
    /// A whole reference page was read as at least one content item.
    pub reference_page: bool,
    /// A reference fragment was read as at least one content item.
    pub reference_fragment: bool,
    /// A whole example entry was read as at least one content item.
    pub example_entry: bool,
    /// One file of an example entry was read as at least one content item.
    pub example_file: bool,
    /// An example entry over the bundle cap was refused with invalid
    /// params.
    pub over_bundle_cap: bool,
    /// An accepted reference URI was answered with resource not found.
    pub reference_not_found: bool,
    /// An accepted example URI was answered with resource not found.
    pub example_not_found: bool,
    /// The reference parser refused a URI with the reference prefix.
    pub reference_malformed: bool,
    /// The example parser refused a URI.
    pub example_malformed: bool,
    /// An error answered a URI longer than `MAX_ECHO` + `MAX_FIXED_TEXT`
    /// characters and echoed the URI's first `MAX_ECHO` characters, so a
    /// message echoing it whole would fail the echo bound.
    pub echo_clipped: bool,
}

/// Reads every non-empty line of one fuzz input as a URI and asserts the
/// properties in the module documentation.
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn uri(input: &str) -> UriPaths {
    let mut paths = UriPaths::default();
    for line in input.lines().filter(|line| !line.is_empty()) {
        check(line, &mut paths);
    }
    paths
}

/// Reads one URI and checks the answer.
fn check(target: &str, paths: &mut UriPaths) {
    let answer = read(target);
    assert_eq!(
        answer,
        read(target),
        "the same URI was answered differently twice"
    );
    assert_tool_parity(target, &answer);
    if let Err((_, message, _)) = &answer {
        super::assert_bounded_echo(message, target, super::MAX_FIXED_TEXT);
        if sanitize(target, usize::MAX).chars().count() > MAX_ECHO + super::MAX_FIXED_TEXT {
            assert!(
                message.contains(&sanitize(target, MAX_ECHO)),
                "an error for a long URI does not echo the URI's clipped start"
            );
            paths.echo_clipped = true;
        }
    }
    if target.starts_with(reference::PREFIX) {
        check_reference(target, &answer, paths);
    } else {
        check_example(target, &answer, paths);
    }
}

/// Checks a URI with the reference prefix.
fn check_reference(target: &str, answer: &Answer, paths: &mut UriPaths) {
    let Some(parsed) = reference::parse(target) else {
        assert_code(answer, INVALID_PARAMS);
        paths.reference_malformed = true;
        return;
    };
    assert!(
        accepted(parsed.stem),
        "an accepted page stem is outside the grammar"
    );
    let rebuilt = match parsed.fragment {
        None => reference::page_uri(parsed.stem),
        Some(fragment) => {
            assert!(
                accepted(fragment),
                "an accepted fragment is outside the grammar"
            );
            assert!(
                fragment.chars().count() <= reference::MAX_FRAGMENT,
                "an accepted fragment is over the length cap"
            );
            reference::fragment_uri(parsed.stem, fragment)
        }
    };
    assert_eq!(
        rebuilt, target,
        "an accepted reference URI does not rebuild to itself"
    );
    match answer {
        Ok(result) => {
            assert_contents(result, |uri| uri == target);
            if parsed.fragment.is_some() {
                paths.reference_fragment = true;
            } else {
                paths.reference_page = true;
            }
        }
        Err(_) => {
            assert_not_found(answer, target);
            paths.reference_not_found = true;
        }
    }
}

/// Checks a URI without the reference prefix, which `resources/read`
/// parses as an example URI.
fn check_example(target: &str, answer: &Answer, paths: &mut UriPaths) {
    match example::parse(target) {
        None => {
            assert_code(answer, INVALID_PARAMS);
            paths.example_malformed = true;
        }
        Some(example::Ref::Entry(id)) => {
            assert_id(id);
            assert_eq!(
                example::entry_uri(id),
                target,
                "an entry URI does not rebuild to itself"
            );
            match answer {
                Ok(result) => {
                    let prefix = format!("{target}/");
                    assert_contents(result, |uri| uri.starts_with(&prefix));
                    paths.example_entry = true;
                }
                Err((INVALID_PARAMS, message, _)) => {
                    assert!(
                        message.contains("bundle cap"),
                        "an entry was refused for another reason"
                    );
                    paths.over_bundle_cap = true;
                }
                Err(_) => {
                    assert_not_found(answer, target);
                    paths.example_not_found = true;
                }
            }
        }
        Some(example::Ref::File(id, name)) => {
            assert_id(id);
            assert!(
                accepted(name),
                "an accepted file name is outside the grammar"
            );
            assert_eq!(
                example::file_uri(id, name),
                target,
                "a file URI does not rebuild to itself"
            );
            match answer {
                Ok(result) => {
                    assert_contents(result, |uri| uri == target);
                    paths.example_file = true;
                }
                Err(_) => {
                    assert_not_found(answer, target);
                    paths.example_not_found = true;
                }
            }
        }
    }
}

/// Whether `part` is one segment of the URI grammar: non-empty, not `.`
/// or `..`, and drawn from `[A-Za-z0-9._-]`.
fn accepted(part: &str) -> bool {
    !part.is_empty()
        && part != "."
        && part != ".."
        && part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Asserts that an example id is two segments of the grammar.
fn assert_id(id: &str) {
    let (bucket, name) = id.split_once('/').expect("an example id has no `/`");
    assert!(
        accepted(bucket) && accepted(name),
        "an accepted example id is outside the grammar"
    );
}
