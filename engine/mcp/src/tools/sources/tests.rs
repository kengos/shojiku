//! Source-argument parsing: the inline/path either-or, the inline cap, and
//! how each form resolves to text and to an assets directory — including the
//! bounded path read, which refuses an oversize or non-regular file unread.

use super::*;
use serde_json::json;

fn err(arguments: &Value, key: &str) -> String {
    let Err((code, message)) = opt_source(arguments, key) else {
        panic!("expected invalid params");
    };
    assert_eq!(code, INVALID_PARAMS);
    message
}

fn some_source(arguments: &Value, key: &str) -> Source {
    let Ok(Some(source)) = opt_source(arguments, key) else {
        panic!("expected a source");
    };
    source
}

#[test]
fn each_source_takes_a_path_or_inline_text_but_never_both() {
    for key in ["definitions", "template", "params"] {
        let mut both = serde_json::Map::new();
        both.insert(key.to_string(), json!("inline text"));
        both.insert(format!("{key}Path"), json!("some/file"));
        let both = Value::Object(both);
        let message = err(&both, key);
        assert!(
            message.contains(&format!("`{key}`")) && message.contains(&format!("`{key}Path`")),
            "{message}"
        );
        assert!(message.contains("mutually exclusive"), "{message}");
    }
}

#[test]
fn an_absent_source_is_none_and_a_required_one_names_both_spellings() {
    assert!(opt_source(&json!({}), "params")
        .expect("absent is fine")
        .is_none());
    assert!(opt_source(&json!({ "params": null }), "params")
        .expect("null is absent")
        .is_none());

    let Err((code, message)) = req_source(&json!({}), "template") else {
        panic!("expected invalid params");
    };
    assert_eq!(code, INVALID_PARAMS);
    assert!(
        message.contains("`template` or `templatePath` is required"),
        "{message}"
    );
}

#[test]
fn a_non_string_source_is_invalid_params() {
    let message = err(&json!({ "template": 5 }), "template");
    assert!(message.contains("`template` must be a string"), "{message}");
    let message = err(&json!({ "templatePath": ["t.yml"] }), "template");
    assert!(
        message.contains("`templatePath` must be a string"),
        "{message}"
    );
}

#[test]
fn an_inline_source_is_accepted_up_to_the_cap_and_refused_past_it() {
    // The admitted maximum still parses...
    let at_cap = "x".repeat(MAX_INLINE_BYTES);
    let source = some_source(&json!({ "template": at_cap }), "template");
    let Ok(text) = source.read() else { panic!("expected inline text") };
    assert_eq!(text.len(), MAX_INLINE_BYTES);

    // ...one byte more is refused, naming the cap and the fallback form.
    let over = "x".repeat(MAX_INLINE_BYTES + 1);
    let message = err(&json!({ "template": over }), "template");
    assert!(
        message.contains(&MAX_INLINE_BYTES.to_string()) && message.contains("`templatePath`"),
        "{message}"
    );
}

#[test]
fn the_oversize_refusal_never_echoes_the_payload() {
    let payload = "SECRET".repeat(MAX_INLINE_BYTES / 6 + 1);
    let message = err(&json!({ "params": payload }), "params");
    assert!(!message.contains("SECRET"), "{message}");
    assert!(message.len() < 250, "{}", message.len());
}

#[test]
fn a_path_source_reads_the_file_and_carries_its_directory() {
    let path = crate::test_support::temp_file("sources-read.yml", "page: {}\n");
    let source = some_source(&json!({ "templatePath": path.clone() }), "template");
    let Ok(text) = source.read() else { panic!("expected the file's text") };
    assert_eq!(text, "page: {}\n");
    assert_eq!(
        source.dir(),
        Path::new(&path).parent().map(Path::to_path_buf)
    );

    assert_eq!(
        some_source(&json!({ "templatePath": "bare.yml" }), "template").dir(),
        Some(PathBuf::from("."))
    );
}

#[test]
fn an_unreadable_path_fails_in_band_with_the_clipped_path() {
    let source = Source::Path(PathBuf::from("/no/such/file.yml"));
    let Err(ToolFailure::Message(message)) = source.read() else {
        panic!("expected a message failure");
    };
    assert!(message.contains("/no/such/file.yml"), "{message}");

    let hostile = Source::Path(PathBuf::from(format!("/tmp/{}\u{7}", "p".repeat(400))));
    let Err(ToolFailure::Message(message)) = hostile.read() else {
        panic!("expected a message failure");
    };
    assert!(
        message.len() < 300 && !message.contains('\u{7}'),
        "{message}"
    );
}

#[test]
fn inline_text_has_no_directory() {
    assert!(Source::Inline("page: {}".into()).dir().is_none());
}

/// A fresh per-process scratch directory for one path-read case.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-mcp-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("scratch dir");
    dir
}

fn read_failure(path: &Path) -> String {
    let Err(ToolFailure::Message(message)) = Source::Path(path.to_path_buf()).read() else {
        panic!("expected a refusal for {}", path.display());
    };
    message
}

#[test]
fn a_path_source_over_the_input_cap_is_refused_naming_the_path_and_the_cap() {
    let cap = shojiku_core::MAX_INPUT_BYTES;
    let big = scratch("oversize").join("big-template.yml");
    // Sparse, so the case costs no disk: refused from its recorded size.
    let file = std::fs::File::create(&big).expect("create");
    file.set_len(cap as u64 + 1).expect("set_len");
    let message = read_failure(&big);
    assert!(message.contains("big-template.yml"), "{message}");
    assert!(message.contains(&cap.to_string()), "{message}");

    // Positive control: the same file at the cap is read whole, so inline
    // and path sources meet the one engine door.
    file.set_len(cap as u64).expect("set_len");
    let Ok(text) = Source::Path(big).read() else { panic!("expected the file at the cap") };
    assert_eq!(text.len(), cap);
}

#[test]
fn a_directory_path_source_is_refused_unread() {
    let dir = scratch("directory");
    let message = read_failure(&dir);
    assert!(message.contains("not a regular file"), "{message}");
    assert!(message.contains("directory"), "{message}");
}

#[cfg(unix)]
#[test]
fn a_fifo_or_an_endless_device_path_source_is_refused_without_blocking() {
    let dir = scratch("special");
    // A FIFO with no writer: opening it for reading would block the whole
    // stdio server; refusal must come from its metadata alone.
    let fifo = dir.join("params.json");
    let made = std::process::Command::new("mkfifo")
        .arg(&fifo)
        .status()
        .expect("mkfifo runs");
    assert!(made.success());
    // A symlink to an endless device: read whole, it never ends.
    let zero = dir.join("template.yml");
    std::os::unix::fs::symlink("/dev/zero", &zero).expect("symlink");
    for path in [fifo, zero] {
        let message = read_failure(&path);
        assert!(message.contains("not a regular file"), "{message}");
    }
}
