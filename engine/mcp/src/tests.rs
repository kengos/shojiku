//! Server flag parsing and the exit-code mapping.

use super::*;

#[test]
fn flags_parse_repeatable_pack_dirs() {
    let args = ServerArgs::parse_from([
        "shojiku-mcp",
        "--font-dir",
        "/f1",
        "--font-dir",
        "/f2",
        "--locale-dir",
        "/l",
    ]);
    assert_eq!(
        args.font_dir,
        vec![PathBuf::from("/f1"), PathBuf::from("/f2")]
    );
    assert_eq!(args.locale_dir, vec![PathBuf::from("/l")]);
    let bare = ServerArgs::parse_from(["shojiku-mcp"]);
    assert!(bare.font_dir.is_empty() && bare.locale_dir.is_empty());
}

#[test]
fn exit_code_reports_transport_failures() {
    let ok = exit_code(Ok(()));
    assert_eq!(format!("{ok:?}"), format!("{:?}", ExitCode::SUCCESS));
    let err = exit_code(Err(McpError::Io(std::io::Error::other("boom"))));
    assert_eq!(format!("{err:?}"), format!("{:?}", ExitCode::FAILURE));
}
