//! `shojiku` binary entry point. All logic lives in the library crate.

use clap::Parser;
use shojiku_cli::{
    report_diagnostics, run_capabilities, run_inspect, run_preview, run_render, run_sign,
    run_validate, run_verify, write_output, Cli, CliError, Command, Report, ReportArg,
};
use shojiku_diagnostics::{sanitize, Diagnostics, MAX_MESSAGE};
use std::process::ExitCode;

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            // Both of these have already printed the JSON that explains
            // them; a second, vaguer line on stderr would add nothing.
            let reported = matches!(
                err,
                CliError::ValidationFailed { .. } | CliError::VerificationFailed
            );
            if !reported {
                // The last unbounded echo boundary on this surface: an engine
                // error quotes template keys, pack ids and file paths, all of
                // which a hostile document chooses. stderr is a terminal, so
                // an unfiltered escape sequence here repaints it.
                eprintln!("shojiku: {}", sanitize(&err.to_string(), MAX_MESSAGE));
            }
            ExitCode::FAILURE
        }
    }
}

/// Writes the `--report` sidecar for an operation that FAILED, then hands
/// the original error straight back.
///
/// This is the path an SDK most needs, and the one easiest to leave out:
/// a failure that returns before writing leaves the caller with a non-zero
/// exit and nothing to classify. The write's own failure is deliberately
/// swallowed — the operation's real cause is what the caller is told
/// about, and a non-zero exit with no report is already unambiguous.
fn fail(step: &'static str, args: &ReportArg, err: CliError) -> CliError {
    if let Some(path) = args.path() {
        let empty = Diagnostics::new();
        let diagnostics = err.diagnostics().unwrap_or(&empty);
        let _ = Report::failed(step, &err, diagnostics).write(path);
    }
    err
}

fn run(cli: Cli) -> Result<(), CliError> {
    match cli.command {
        Command::Validate(args) => {
            let diags = run_validate(&args)?;
            println!("{}", serde_json::to_string_pretty(&diags)?);
            report_diagnostics(&diags);
            if diags.has_errors() {
                return Err(CliError::ValidationFailed { diagnostics: diags });
            }
            Ok(())
        }
        Command::Inspect(args) => {
            let json = run_inspect(&args)?;
            println!("{json}");
            Ok(())
        }
        Command::Render(args) => {
            let rendered = run_render(&args).map_err(|err| fail("render", &args.report, err))?;
            write_output(&args.output, &rendered.bytes)
                .map_err(|err| fail("render", &args.report, err))?;
            if let Some(path) = args.report.path() {
                Report::success(&rendered.diagnostics)
                    .with_page_count(rendered.page_count)
                    .write(path)?;
            }
            Ok(())
        }
        Command::Preview(args) => {
            for (path, bytes) in run_preview(&args)? {
                write_output(&path, &bytes)?;
            }
            Ok(())
        }
        Command::Sign(args) => {
            let bytes = run_sign(&args).map_err(|err| fail("sign", &args.report, err))?;
            write_output(&args.output, &bytes).map_err(|err| fail("sign", &args.report, err))?;
            if let Some(path) = args.report.path() {
                // No page count: signing appends a revision to bytes it
                // never laid out, and zero would read as "no pages".
                Report::success(&Diagnostics::new()).write(path)?;
            }
            Ok(())
        }
        Command::Verify(args) => {
            let report = run_verify(&args).map_err(|err| fail("verify", &args.report, err))?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            // The report is printed either way; the exit code carries the
            // verdict, so a script can branch on it without parsing JSON.
            let valid = report.is_valid();
            if let Some(path) = args.report.path() {
                // Carried on a FAILING verdict too: what the release did
                // NOT check has to reach the caller either way, and a
                // failed verdict with no report reads as "nothing to say".
                let empty = Diagnostics::new();
                let envelope = if valid {
                    Report::success(&empty)
                } else {
                    Report::failed("verify", &CliError::VerificationFailed, &empty)
                };
                envelope.with_verification(&report).write(path)?;
            }
            if valid {
                Ok(())
            } else {
                Err(CliError::VerificationFailed)
            }
        }
        Command::Capabilities => {
            println!("{}", run_capabilities()?);
            Ok(())
        }
    }
}
