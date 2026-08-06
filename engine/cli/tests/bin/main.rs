//! End-to-end tests of the `shojiku` binary: shared fixtures/helpers here,
//! per-command suites in the sibling modules.
//!
//! Spawning via `CARGO_BIN_EXE_shojiku` keeps `main.rs` inside the
//! coverage measurement (cargo-llvm-cov instruments child processes).

mod caps;
mod echo;
mod external;
mod fetch;
mod font;
mod outputs;
mod report;
mod sign;
mod validate;
mod verify;

use std::path::PathBuf;
use std::process::{Command, Output};

fn examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/receipt-ja")
}

fn tickets_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/event-tickets-ja")
}

fn font_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

fn locale_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/locale")
}

fn shojiku(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_shojiku"))
        .args(args)
        .output()
        .expect("spawn shojiku")
}

fn path_arg(path: PathBuf) -> String {
    path.to_str().expect("utf8 path").to_string()
}

fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("shojiku-bin-test-{}-{name}", std::process::id()))
}
