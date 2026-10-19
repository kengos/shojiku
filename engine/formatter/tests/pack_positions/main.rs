//! What the pack doors report on a broken or edge-case document, recorded as
//! one golden file so a change of YAML reading shows up as a diff of it.
//!
//! Every `.yml` file under `cases/` is a locale pack, a locale overlay or a
//! font-pack manifest (the file-name prefix picks the door: `lang-` reads
//! through `LangPack::from_yaml_str`, `overlay-` through `LangPack::builtin`
//! over `ja-JP`, `manifest-` through `PackManifest::from_yaml`).
//! `expected.txt` holds `ok` with a few fields of what was read, or the error
//! the door returned. The record is of what the doors DO, not of what they
//! should do.
//!
//! A deliberate change rewrites `expected.txt`. On a mismatch the test prints
//! the whole actual record, which replaces the file as it stands, and the
//! review reads the file's diff.

use shojiku_formatter::{LangPack, LangPackError, PackManifest};
use std::path::{Path, PathBuf};

fn suite_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/pack_positions")
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

/// One case's record body, through the door its file-name prefix names.
fn record(name: &str, text: &str) -> String {
    match name.split('-').next() {
        Some("lang") => lang(LangPack::from_yaml_str(text)),
        Some("overlay") => {
            lang(LangPack::builtin("ja-JP", Some(text)).map(|pack| pack.expect("ja-JP is builtin")))
        }
        Some("manifest") => match PackManifest::from_yaml(text) {
            Ok(manifest) => format!(
                "ok version={} license={} faces={}",
                manifest.version,
                manifest.license,
                manifest.faces.len()
            ),
            Err(err) => format!("error\nmessage: {err}"),
        },
        _ => panic!("{name}: a case is named after its door (lang-, overlay-, manifest-)"),
    }
}

/// A pack read is recorded by its id and the date formats an overlay merges
/// into (so a per-key merge that replaced the whole table shows).
fn lang(result: Result<LangPack, LangPackError>) -> String {
    match result {
        Ok(pack) => format!(
            "ok id={} dateFormats={}",
            pack.id,
            serde_json::to_string(&pack.date_formats).expect("a string map serializes")
        ),
        Err(LangPackError::Parse(message)) => format!("parse\nmessage: {}", message.as_str()),
        Err(other) => format!("other\nmessage: {other}"),
    }
}

#[test]
fn every_case_reports_the_recorded_result() {
    let cases = cases();
    // An empty directory would compare an empty record against an empty
    // file and pass; the committed set is larger than this.
    assert!(cases.len() >= 20, "the committed cases are missing");
    let actual: String = cases
        .iter()
        .map(|(name, text)| format!("## {name}\n{}\n", record(name, text)))
        .collect::<Vec<_>>()
        .join("\n");
    let expected =
        std::fs::read_to_string(suite_dir().join("expected.txt")).expect("the expected record");
    assert!(
        actual == expected,
        "the pack record changed; the actual record follows, and it \
         replaces expected.txt if the change is deliberate:\n{actual}"
    );
}
