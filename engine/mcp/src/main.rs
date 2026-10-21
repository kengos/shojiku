//! `shojiku-mcp` binary entry point. All logic lives in the library crate.

use clap::Parser;
use shojiku_mcp::{ServerArgs, run_stdio};
use std::process::ExitCode;

fn main() -> ExitCode {
    let args = ServerArgs::parse();
    run_stdio(&args)
}
