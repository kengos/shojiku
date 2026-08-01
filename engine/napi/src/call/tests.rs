//! The boundary's tests, and the fixtures they share.
//!
//! Driven through this crate's own safe surface — the same functions the
//! N-API shim calls — against the real engine and the repository's own packs.
//! Nothing at the boundary is mocked: the point of this host is what the
//! linked library actually returns.

mod documents;
mod signing;
mod verifying;

use super::*;
use serde_json::json;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

fn repo_path(relative: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative)
}

fn path_str(path: &std::path::Path) -> String {
    path.to_str().expect("a utf8 path").to_string()
}

/// Serializes a request envelope to the bytes the boundary takes.
fn envelope(value: serde_json::Value) -> Vec<u8> {
    serde_json::to_vec(&value).expect("an envelope serializes")
}

/// The envelope for one bundled example, pointing at the repository's own
/// packs — the same inputs `make examples` renders with.
fn example_request(example: &str) -> Vec<u8> {
    let dir = repo_path("examples/business").join(example);
    let read =
        |name: &str| std::fs::read_to_string(dir.join(name)).expect("an example source file");
    envelope(json!({
        "template": read("templates.yml"),
        "definitions": read("definitions.yml"),
        "params": read("params.json"),
        "fontDirs": [path_str(&repo_path("packs/fonts"))],
        "localeDirs": [path_str(&repo_path("packs/locale"))],
        "assetsDir": path_str(&dir),
    }))
}

fn receipt_request() -> Vec<u8> {
    example_request("receipt-ja")
}

/// Key material, generated into a per-process directory ONCE.
///
/// The `OnceLock` is load-bearing rather than tidiness: tests run in
/// parallel and the generator writes its completion sentinel last, so two
/// concurrent runs would both decide the directory is unfinished and rewrite
/// the files under a third test that is already reading them.
fn keys() -> &'static PathBuf {
    static KEYS: OnceLock<PathBuf> = OnceLock::new();
    KEYS.get_or_init(|| {
        let dir = std::env::temp_dir().join(format!("shojiku-napi-keys-{}", std::process::id()));
        let script = repo_path("scripts/gen-test-keys.sh");
        let output = Command::new("sh")
            .arg(&script)
            .arg(&dir)
            .output()
            .expect("running the test-key generator");
        assert!(output.status.success(), "the test-key generator failed");
        dir
    })
}

fn key_bytes(name: &str) -> Vec<u8> {
    std::fs::read(keys().join(name)).expect("a generated key file")
}

/// Renders the bundled receipt, so signing and verification run over bytes
/// this engine actually produced rather than a committed fixture.
fn rendered_receipt() -> Vec<u8> {
    let outcome = render(&receipt_request());
    assert!(outcome.success, "error: {}", outcome.error);
    outcome.pdf
}

/// Signs the rendered receipt with the unencrypted test key.
fn signed_receipt() -> Vec<u8> {
    let outcome = sign(
        &rendered_receipt(),
        &key_bytes("rsa2048.key.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert!(outcome.success, "error: {}", outcome.error);
    outcome.pdf
}

#[test]
fn a_status_with_no_handle_behind_it_becomes_an_empty_outcome() {
    // The C host writes a handle on every path it can reach, so this arm is
    // not reachable through the surface — which is exactly why it is tested
    // directly rather than left to dereference whatever it was handed.
    // SAFETY: a null handle is what this function is being asked about.
    let outcome = unsafe { read(shojiku_capi::SHOJIKU_ERR_PANIC, std::ptr::null_mut()) };
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_ERR_PANIC);
    assert!(!outcome.success);
    assert!(outcome.pdf.is_empty());
    assert!(outcome.json.is_empty());
    assert!(outcome.diagnostics.is_empty());
    assert!(outcome.error.is_empty());
}

#[test]
fn the_abi_revision_is_the_one_the_sdk_pins() {
    // Statically linked, so this cannot drift between the addon and the
    // engine inside it — the npm package still checks it, and this is what
    // says which answer it will get.
    assert_eq!(abi_version(), 1);
}
