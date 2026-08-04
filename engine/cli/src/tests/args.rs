//! Argument parsing, path resolution, and the pack-error mapping.

use super::*;
use shojiku_image::AssetMode;

#[test]
fn cli_parses_render_command() {
    let cli = Cli::parse_from([
        "shojiku",
        "render",
        "--templates",
        "t.yml",
        "--params",
        "p.json",
        "--output",
        "out.pdf",
    ]);
    let Command::Render(args) = cli.command else { panic!("expected render") };
    assert_eq!(args.output, "out.pdf");
    assert_eq!(args.common.templates, PathBuf::from("t.yml"));
}

#[test]
fn locale_pack_failures_map_to_pack_fs_errors() {
    // The FS pack discovery itself is tested in `shojiku-authoring`'s `fs`
    // module; here only the CliError mapping through the pipeline.
    let mut args = example_render_args().common;
    args.lang = Some("fr-FR".to_string());
    args.locale_dir = vec![PathBuf::from("/no/such")];
    let err = run_inspect(&args).unwrap_err();
    assert!(matches!(err, CliError::PackFs(_)), "{err}");
    assert!(err.to_string().contains("fr-FR"));
}

#[test]
fn asset_mode_maps_to_policy_and_flags_parse() {
    let cli = Cli::parse_from([
        "shojiku",
        "render",
        "--templates",
        "t.yml",
        "--params",
        "p.json",
        "--output",
        "-",
        "--asset-mode",
        "bundled-only",
        "--allow-dynamic-image",
        "qr",
        "--deny-dynamic-image",
        "stamp",
        "--assets-dir",
        "/assets",
    ]);
    let Command::Render(args) = cli.command else { panic!("expected render") };
    assert_eq!(args.common.asset_mode, AssetModeArg::BundledOnly);
    let policy = args.common.asset_policy();
    assert_eq!(policy.mode, AssetMode::BundledOnly);
    assert_eq!(policy.dynamic_allow, vec!["qr".to_string()]);
    assert_eq!(policy.dynamic_deny, vec!["stamp".to_string()]);
    assert_eq!(args.common.assets_root(), PathBuf::from("/assets"));
    assert_eq!(AssetMode::from(AssetModeArg::Open), AssetMode::Open);
}

#[test]
fn assets_root_defaults_to_template_directory() {
    let mut args = example_render_args().common;
    assert_eq!(args.assets_root(), examples_dir());
    // A bare filename (no parent directory) resolves to `.`.
    args.templates = PathBuf::from("t.yml");
    assert_eq!(args.assets_root(), PathBuf::from("."));
}

#[test]
fn cli_parses_preview_command() {
    let cli = Cli::parse_from([
        "shojiku",
        "preview",
        "--templates",
        "t.yml",
        "--params",
        "p.json",
        "--output",
        "p-{page}.png",
        "--scale",
        "1.5",
        "--page",
        "2",
    ]);
    let Command::Preview(args) = cli.command else { panic!("expected preview") };
    assert_eq!(args.output, "p-{page}.png");
    assert_eq!(args.scale, 1.5);
    assert_eq!(args.page, Some(2));
}

#[test]
fn preview_output_pattern_rules() {
    // Single page: a plain path is fine.
    assert_eq!(
        resolve_preview_output("out.png", 1, false).expect("single"),
        "out.png"
    );
    // Placeholder is substituted with the 1-based page number.
    assert_eq!(
        resolve_preview_output("p-{page}.png", 3, true).expect("multi"),
        "p-3.png"
    );
    // Multi-page without a placeholder is rejected.
    assert!(matches!(
        resolve_preview_output("out.png", 1, true),
        Err(CliError::OutputPatternRequired(p)) if p == "out.png"
    ));
}

#[test]
fn output_error_carries_path() {
    let err = output_error("-", std::io::Error::other("boom"));
    assert!(matches!(err, CliError::Output { ref path, .. } if path == "-"));
    assert!(err.to_string().contains("boom"));
}

#[test]
fn offline_and_font_fetch_allow_parse() {
    let cli = Cli::try_parse_from([
        "shojiku",
        "render",
        "--templates",
        "t.yml",
        "--params",
        "p.json",
        "--output",
        "o.pdf",
        "--offline",
        "--font-fetch-allow",
        "fonts.internal.example",
        "--font-fetch-allow",
        "mirror.example",
    ])
    .expect("parse");
    let Command::Render(args) = cli.command else { panic!("expected render") };
    assert!(args.common.offline);
    assert_eq!(
        args.common.font_fetch_allow,
        ["fonts.internal.example", "mirror.example"]
    );
}

#[test]
fn fetching_is_on_by_default() {
    let cli = Cli::try_parse_from([
        "shojiku",
        "render",
        "--templates",
        "t.yml",
        "--params",
        "p.json",
        "--output",
        "o.pdf",
    ])
    .expect("parse");
    let Command::Render(args) = cli.command else { panic!("expected render") };
    assert!(!args.common.offline, "auto-fetch is the default UX");
    assert!(args.common.font_fetch_allow.is_empty());
}

#[test]
fn fetched_fonts_are_reported_one_line_each() {
    let mut report = shojiku_fetch::FetchReport::default();
    report
        .fetched
        .push(("noto-sans".into(), "https://x/a.ttf".into()));
    report
        .fetched
        .push(("noto-bold".into(), "https://x/b.ttf".into()));

    let mut out = Vec::new();
    crate::commands::report_fetched(&report, &mut out);

    let text = String::from_utf8(out).expect("utf8");
    assert_eq!(text.lines().count(), 2, "got: {text}");
    assert!(
        text.contains("fetched font `noto-sans` from https://x/a.ttf"),
        "got: {text}"
    );
    assert!(
        text.contains("fetched font `noto-bold` from https://x/b.ttf"),
        "got: {text}"
    );
}

#[test]
fn nothing_fetched_prints_nothing() {
    let mut out = Vec::new();
    crate::commands::report_fetched(&shojiku_fetch::FetchReport::default(), &mut out);
    assert!(out.is_empty(), "silent when no font was downloaded");
}

#[test]
fn verify_requires_at_least_one_trust_anchor_and_takes_several() {
    // Required on purpose: verification never consults the machine's trust
    // store, so there is no default to fall back on and a `verify` with no
    // anchor would have to invent one.
    assert!(Cli::try_parse_from(["shojiku", "verify", "--input", "signed.pdf"]).is_err());

    let cli = Cli::try_parse_from([
        "shojiku",
        "verify",
        "--input",
        "signed.pdf",
        "--anchor",
        "root.pem",
        "--anchor",
        "intermediate.pem",
    ])
    .expect("the flags parse");
    let Command::Verify(args) = cli.command else {
        panic!("expected the verify command");
    };
    assert_eq!(args.input, PathBuf::from("signed.pdf"));
    assert_eq!(
        args.anchor,
        vec![PathBuf::from("root.pem"), PathBuf::from("intermediate.pem")]
    );
}

#[test]
fn no_command_takes_a_passphrase_on_the_command_line() {
    // `argv` is readable by other processes and lands in shell history, so
    // the passphrase reaches `sign` through a prompt or a NAMED environment
    // variable and never as a value here. This pins the absence, which is
    // otherwise the kind of thing a later convenience flag quietly undoes.
    for flag in ["--passphrase", "--password", "--pass"] {
        assert!(
            Cli::try_parse_from([
                "shojiku", "sign", "--input", "in.pdf", "--key", "k.pem", "--cert", "c.pem",
                "--output", "-", flag, "secret",
            ])
            .is_err(),
            "`{flag}` was accepted"
        );
    }
    // The variable NAME is a flag, and it carries no secret.
    assert!(Cli::try_parse_from([
        "shojiku",
        "sign",
        "--input",
        "in.pdf",
        "--key",
        "k.pem",
        "--cert",
        "c.pem",
        "--output",
        "-",
        "--passphrase-env",
        "SHOJIKU_PASSPHRASE",
    ])
    .is_ok());
}

#[test]
fn a_hostile_face_id_or_url_cannot_ride_the_fetched_line_to_stderr() {
    // This line prints a manifest's own face id and URL, so it is an echo
    // like any error message — and it is the one that reads as transparency
    // rather than as a failure, which is why it was easy to miss.
    let hostile = format!("\u{1b}[2J\u{7}{}", "n".repeat(10_000));
    let mut report = shojiku_fetch::FetchReport::default();
    report
        .fetched
        .push((hostile.as_str().into(), hostile.as_str().into()));

    let mut out = Vec::new();
    crate::commands::report_fetched(&report, &mut out);

    let text = String::from_utf8(out).expect("utf8");
    assert!(
        !text.chars().any(|c| c.is_control() && c != '\n'),
        "control character reached stderr: {text:?}"
    );
    assert!(
        text.chars().count() < 2 * (shojiku_diagnostics::MAX_ECHO + 1) + 100,
        "unbounded fetched line ({} chars)",
        text.chars().count()
    );
}
