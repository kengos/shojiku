//! `shojiku font add` + `--font-pack`, driven through the real binary.
//!
//! The claim under test is the whole loop a user actually runs: add a
//! licensed face, then RENDER a document that names it. Neither half means
//! anything alone — a pack that writes cleanly and does not load is the
//! failure this command exists to prevent.

use super::*;

mod render;

/// A per-test directory, since these write packs rather than one file.
fn temp_dir(name: &str) -> PathBuf {
    let dir = temp_path(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

fn source_font() -> PathBuf {
    font_dir().join("noto-sans/NotoSans-Regular.ttf")
}

/// Adds `NotoSans-Regular.ttf` to `dir` under `family`, as a user would.
fn add(dir: &std::path::Path, family: &str, extra: &[&str]) -> std::process::Output {
    let file = path_arg(source_font());
    let target = path_arg(dir.to_path_buf());
    let mut args = vec![
        "font",
        "add",
        &file,
        "--family",
        family,
        "--license",
        "OFL-1.1",
        "--dir",
        &target,
    ];
    args.extend_from_slice(extra);
    shojiku(&args)
}

#[test]
fn font_add_writes_a_pack_and_reports_what_it_wrote() {
    let dir = temp_dir("font-add");
    let out = add(&dir, "my-sans", &[]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    // The pack id is the one thing the caller cannot guess and needs for
    // `--font-pack`, so the confirmation has to carry it.
    assert!(stdout.contains("my-sans"), "stdout: {stdout}");
    assert!(dir.join("my-sans/manifest.yml").is_file());
    assert!(dir.join("my-sans/NotoSans-Regular.ttf").is_file());
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

#[test]
fn the_documented_two_command_family_sequence_works_verbatim() {
    // The tutorials print exactly this pair (regular, then `--weight bold`
    // into the same family). A command line an artifact tells a reader to
    // type is a claim, so it is run here rather than trusted.
    let dir = temp_dir("font-add-documented");
    assert!(add(&dir, "my-corporate", &[]).status.success());

    let bold = path_arg(font_dir().join("noto-sans/NotoSans-Bold.ttf"));
    let target = path_arg(dir.clone());
    let out = shojiku(&[
        "font",
        "add",
        &bold,
        "--family",
        "my-corporate",
        "--license",
        "OFL-1.1",
        "--weight",
        "bold",
        "--dir",
        &target,
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let manifest =
        std::fs::read_to_string(dir.join("my-corporate/manifest.yml")).expect("manifest");
    assert!(manifest.contains("weight: bold"), "{manifest}");
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

/// Writes a copy of the source face with OS/2 `fsType` patched to the
/// Restricted bit — the same construction the loader's own guard test uses.
fn restricted_face(dir: &std::path::Path) -> PathBuf {
    let mut bytes = std::fs::read(source_font()).expect("source");
    let n = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
    let rec = (0..n)
        .map(|i| 12 + i * 16)
        .find(|&r| &bytes[r..r + 4] == b"OS/2")
        .expect("OS/2 record");
    let o = u32::from_be_bytes(bytes[rec + 8..rec + 12].try_into().expect("offset")) as usize + 8;
    bytes[o] = 0x00;
    bytes[o + 1] = 0x02;
    let path = dir.join("Restricted.ttf");
    std::fs::write(&path, &bytes).expect("write restricted");
    path
}

#[test]
fn a_restricted_face_is_refused_at_add_time() {
    let dir = temp_dir("font-add-restricted");
    let restricted = restricted_face(&dir);

    let out = shojiku(&[
        "font",
        "add",
        &path_arg(restricted),
        "--family",
        "restricted",
        "--license",
        "Proprietary",
        "--dir",
        &path_arg(dir.clone()),
    ]);
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("--embedding-attested"), "stderr: {stderr}");
    assert!(
        !dir.join("restricted").exists(),
        "a refused add wrote a pack"
    );
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

#[test]
fn an_attested_restricted_face_is_added_and_the_notice_is_printed() {
    // The other half of the fsType decision: with the attestation the pack
    // is written, and the run SAYS the embedding guard no longer applies —
    // an attestation that happened silently would be the wrong default.
    let dir = temp_dir("font-add-attested");
    let restricted = restricted_face(&dir);
    let out = shojiku(&[
        "font",
        "add",
        &path_arg(restricted),
        "--family",
        "attested",
        "--license",
        "Proprietary",
        "--dir",
        &path_arg(dir.clone()),
        "--embedding-attested",
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("embedding attestation"), "stderr: {stderr}");
    let manifest = std::fs::read_to_string(dir.join("attested/manifest.yml")).expect("manifest");
    assert!(manifest.contains("embeddingAttested: true"), "{manifest}");
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

#[test]
fn font_add_requires_a_family_and_a_license() {
    // Both are required because the manifest cannot honestly default them:
    // `license` is a required wire field and the family is what a template
    // names.
    let out = shojiku(&["font", "add", &path_arg(source_font())]);
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("--family"), "stderr: {stderr}");
    assert!(stderr.contains("--license"), "stderr: {stderr}");
}
