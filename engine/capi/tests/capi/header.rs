//! The header and the exports must say the same thing.
//!
//! `include/shojiku.h` is hand-written, which buys prose a generator cannot
//! produce and costs exactly one risk: the two drifting apart. This is the
//! gate on that risk, and it runs both ways — an export the header never
//! declares is unusable, and a declaration with no export behind it is a
//! linker error in someone else's build.

use super::*;

/// Every symbol this crate exports, taken from the `#[no_mangle]` attributes
/// themselves rather than from a list someone has to remember to update.
fn exported_symbols() -> Vec<String> {
    let mut found = Vec::new();
    for file in rust_sources(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src")) {
        let text = std::fs::read_to_string(&file).expect("a source file");
        let mut lines = text.lines();
        while let Some(line) = lines.next() {
            if line.trim() != "#[no_mangle]" {
                continue;
            }
            // The signature may start on the next line or a few below it
            // (attributes stack); take the first one that declares a fn.
            let signature = lines
                .by_ref()
                .find(|line| line.contains("extern \"C\" fn "))
                .expect("a #[no_mangle] item declares an extern fn");
            found.push(fn_name(signature));
        }
    }
    found.sort();
    found
}

/// The header's text.
fn header_text() -> String {
    std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("include/shojiku.h"))
        .expect("the header")
}

/// Every function the header declares. A declaration starts at column zero;
/// comments and preprocessor lines do not.
fn declared_symbols() -> Vec<String> {
    let header = header_text();
    let mut found: Vec<String> = header
        .lines()
        .filter(|line| {
            line.starts_with(|c: char| c.is_ascii_alphabetic())
                && line.contains("shojiku_")
                && line.contains('(')
        })
        .map(|line| {
            let start = line.find("shojiku_").expect("the symbol");
            let rest = &line[start..];
            let end = rest.find('(').expect("the argument list");
            rest[..end].to_string()
        })
        .collect();
    found.sort();
    found
}

/// The identifier between `extern "C" fn ` and its argument list.
fn fn_name(signature: &str) -> String {
    let start = signature
        .find("extern \"C\" fn ")
        .expect("an extern declaration")
        + "extern \"C\" fn ".len();
    let rest = &signature[start..];
    let end = rest.find('(').expect("the argument list");
    rest[..end].trim().to_string()
}

/// Every `.rs` file under a directory, recursively.
fn rust_sources(dir: &PathBuf) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(dir).expect("a source directory") {
        let path = entry.expect("a directory entry").path();
        if path.is_dir() {
            files.extend(rust_sources(&path));
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            files.push(path);
        }
    }
    files
}

#[test]
fn the_header_declares_exactly_what_the_library_exports() {
    let exported = exported_symbols();
    let declared = declared_symbols();

    // Print the input counts before asserting anything about them: a scan
    // that silently matched nothing would otherwise pass this test twice
    // over, once in each direction.
    println!(
        "header parity: {} exported symbols, {} header declarations",
        exported.len(),
        declared.len()
    );
    assert!(
        exported.len() >= 13,
        "the scan found only {} exports, which cannot be right",
        exported.len()
    );
    assert!(
        exported.iter().all(|name| name.starts_with("shojiku_")),
        "every export is namespaced: {exported:?}"
    );
    assert_eq!(
        exported, declared,
        "the header and the exports have drifted apart"
    );
}

#[test]
fn every_status_code_in_the_header_has_the_value_the_library_returns() {
    // The symbols matching is not enough: an SDK branches on these NUMBERS,
    // and a header that renumbers one silently turns "not UTF-8" into
    // "malformed request" in seven languages at once. Nothing else pins them.
    let expected = [
        ("SHOJIKU_OK", SHOJIKU_OK),
        ("SHOJIKU_ERR_NULL_ARG", SHOJIKU_ERR_NULL_ARG),
        ("SHOJIKU_ERR_INVALID_UTF8", SHOJIKU_ERR_INVALID_UTF8),
        ("SHOJIKU_ERR_INVALID_REQUEST", SHOJIKU_ERR_INVALID_REQUEST),
        ("SHOJIKU_ERR_TOO_LARGE", SHOJIKU_ERR_TOO_LARGE),
        ("SHOJIKU_ERR_OUT_OF_RANGE", SHOJIKU_ERR_OUT_OF_RANGE),
        ("SHOJIKU_ERR_PANIC", SHOJIKU_ERR_PANIC),
    ];
    let header = header_text();
    let defines: Vec<(String, i32)> = header
        .lines()
        .filter_map(|line| line.strip_prefix("#define SHOJIKU"))
        .filter_map(|rest| {
            let mut parts = rest.split_whitespace();
            let name = format!("SHOJIKU{}", parts.next()?);
            Some((name, parts.next()?.parse().ok()?))
        })
        .collect();

    // Print the input count before asserting on it: a parser that matched
    // nothing would otherwise satisfy every "contains" check below.
    println!("header defines found: {}", defines.len());
    assert_eq!(
        defines.len(),
        expected.len(),
        "the header defines {} status codes, the library has {}",
        defines.len(),
        expected.len()
    );
    for (name, value) in expected {
        assert!(
            defines.contains(&(name.to_string(), value)),
            "the header must define {name} as {value}, got {defines:?}"
        );
    }
}
