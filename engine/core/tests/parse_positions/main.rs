//! Where today's parse doors place an error on a broken document, recorded
//! as one golden file so a change of YAML parser shows up as a diff of it.
//!
//! Every `.yml` file under `cases/` is a template, definitions or params
//! document (the file-name prefix picks the door), broken or at an edge a
//! parser could read differently. `expected.txt` holds what its public entry
//! point reports: `ok` for a document it accepts (with the JSON a params
//! document was read as), and otherwise the error variant and, for a located
//! failure, the path, the rejected key, the line and column — the fields the
//! Designer's diagnostics and its "remove this key" quick-fix read — plus the
//! message. The record is of what the doors DO, not of what they should do:
//! a case whose position is poor today is still recorded as it is.
//!
//! A deliberate change to a parse error rewrites `expected.txt`. On a
//! mismatch the test prints the whole actual record, which replaces the file
//! as it stands, and the review reads the file's diff.

use shojiku_core::{CoreError, parse_definitions, parse_params, parse_template};
use std::path::{Path, PathBuf};

fn suite_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/parse_positions")
}

/// Every case as `(file name, text)`, in file-name order.
fn cases() -> Vec<(String, String)> {
    // Only `.yml` files are cases, so a file a tool drops beside them (an
    // editor's swap file, `.DS_Store`) is not read as one.
    let mut cases: Vec<(String, String)> = std::fs::read_dir(suite_dir().join("cases"))
        .expect("the cases directory")
        .map(|entry| entry.expect("a case entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "yml"))
        .map(|path| {
            let text = std::fs::read_to_string(&path).expect("a UTF-8 case");
            (file_name(&path), text)
        })
        .collect();
    cases.sort();
    cases
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .expect("a file name")
        .to_string_lossy()
        .into_owned()
}

/// The door a case goes through, by its file-name prefix. Params accepted
/// are recorded as the JSON they were read as, since how a scalar is read
/// (`yes`, `017`, `<<`) is exactly what a different parser could change.
fn parse(name: &str, text: &str) -> Result<Option<String>, CoreError> {
    match name.split('-').next() {
        Some("template") => parse_template(text).map(|_| None),
        Some("definitions") => parse_definitions(text).map(|_| None),
        Some("params") => parse_params(text).map(|json| Some(json.to_string())),
        _ => panic!("{name}: a case is named after its door (template-, definitions-, params-)"),
    }
}

/// One case's record: `ok` (with what params were read as), or the error's
/// variant and every field it carries.
fn record(name: &str, result: &Result<Option<String>, CoreError>) -> String {
    let err = match result {
        Ok(None) => return format!("## {name}\nok\n"),
        Ok(Some(read_as)) => return format!("## {name}\nok {read_as}\n"),
        Err(err) => err,
    };
    let body = match err {
        CoreError::Located {
            what,
            path,
            key,
            line,
            column,
            message,
        } => format!(
            "located {what}\npath: {path}\nkey: {}\nline: {line}\ncolumn: {column}\nmessage: {message}",
            key.as_ref().map_or("-", |key| key.as_str()),
            // An empty path would end the line in a space, which an editor
            // trims and the comparison then reads as a change.
            path = if path.is_empty() {
                "(empty)"
            } else {
                path.as_str()
            },
            message = message.as_str(),
        ),
        CoreError::Parse(message) => format!("parse\nmessage: {}", message.as_str()),
        CoreError::Json(message) => format!("json\nmessage: {}", message.as_str()),
        CoreError::NonFinite(what) => format!("non-finite {what}"),
        other => format!("other\nmessage: {other}"),
    };
    format!("## {name}\n{body}\n")
}

#[test]
fn every_case_reports_the_recorded_position() {
    let cases = cases();
    // An empty directory would compare an empty record against an empty
    // file and pass; the committed set is larger than this.
    assert!(cases.len() >= 20, "the committed cases are missing");
    let actual: String = cases
        .iter()
        .map(|(name, text)| record(name, &parse(name, text)))
        .collect::<Vec<_>>()
        .join("\n");
    let expected =
        std::fs::read_to_string(suite_dir().join("expected.txt")).expect("the expected record");
    assert!(
        actual == expected,
        "the parse-error record changed; the actual record follows, and it \
         replaces expected.txt if the change is deliberate:\n{actual}"
    );
}
