//! Implementation of the `shojiku-mcp` stdio MCP server.
//!
//! A hand-rolled JSON-RPC 2.0 loop (newline-delimited, no async runtime —
//! a deliberate zero-new-dependency choice) exposing the shared authoring
//! surface (`shojiku-authoring`) as MCP tools: `validate` /
//! `render_preview` / `inspect_layout` / `capabilities` / `format_catalog`.
//! Every template tool response carries diagnostics alongside its payload
//! (preview images, inspect envelope, the format catalog) so an AI client
//! never receives a payload without its reasons; the layout tree/boxes for
//! a preview are retrievable via `inspect_layout` with the same inputs.
//! `main.rs` stays thin; everything testable lives here.

use clap::Parser;
use std::path::PathBuf;
use std::process::ExitCode;

mod examples;
mod instructions;
mod reference;
mod resources;
mod rpc;
mod server;
mod tools;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

pub use server::serve;

/// `shojiku-mcp` server flags: the pack search dirs, mirroring the CLI's.
/// Template/definitions/params arrive per tool call as paths.
#[derive(Debug, Parser)]
#[command(
    name = "shojiku-mcp",
    about = "Shojiku MCP server over stdio (validate / render_preview / inspect_layout / capabilities / format_catalog)",
    version
)]
pub struct ServerArgs {
    /// Font pack search dir (repeatable, earlier wins). Adds to
    /// $SHOJIKU_FONT_DIR then ./packs/fonts.
    #[arg(long)]
    pub font_dir: Vec<PathBuf>,
    /// Locale pack search dir (repeatable, earlier wins). Adds to
    /// $SHOJIKU_LOCALE_DIR then ./packs/locale.
    #[arg(long)]
    pub locale_dir: Vec<PathBuf>,
}

/// Server failure. Only transport-level I/O aborts the loop; protocol and
/// tool problems are answered in-band.
#[derive(Debug, thiserror::Error)]
pub enum McpError {
    #[error("stdio transport error: {0}")]
    Io(#[from] std::io::Error),
}

/// Runs the server over the process stdio streams.
pub fn run_stdio(args: &ServerArgs) -> ExitCode {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    exit_code(serve(args, &mut stdin.lock(), &mut stdout.lock()))
}

/// Maps the serve result to the process exit code, reporting transport
/// failures on stderr.
pub fn exit_code(result: Result<(), McpError>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("shojiku-mcp: {err}");
            ExitCode::FAILURE
        }
    }
}
