//! The render side of the loop: `--font-pack` naming a pack `font add`
//! wrote, and the guard that a flag-supplied id is no more trusted than a
//! parsed one.

use super::*;

#[test]
fn an_added_pack_renders_when_font_pack_names_it() {
    let dir = temp_dir("font-pack-render");
    assert!(add(&dir, "user-sans", &[]).status.success());

    let templates = dir.join("templates.yml");
    std::fs::write(
        &templates,
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        text: "Hello"
        style: { fontFamily: user-sans }
"#,
    )
    .expect("write template");
    let params = dir.join("params.json");
    std::fs::write(&params, b"{}").expect("write params");
    let output = dir.join("out.pdf");

    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(templates.clone()),
        "--params",
        &path_arg(params.clone()),
        "--output",
        &path_arg(output.clone()),
        "--lang",
        "en-US",
        "--font-dir",
        &path_arg(font_dir()),
        "--font-dir",
        &path_arg(dir.clone()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--font-pack",
        "user-sans",
    ]);
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(out.status.success(), "stderr: {stderr}");
    // The family resolved: an unknown one would warn instead of drawing.
    assert!(!stderr.contains("unknown_font_family"), "stderr: {stderr}");
    assert!(std::fs::read(&output).expect("pdf").starts_with(b"%PDF-"));
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

#[test]
fn without_font_pack_the_same_family_is_unknown() {
    // The negative control for the test above: the pack exists on disk and
    // the font dir is searched, and it is STILL not loaded — a pack is never
    // picked up implicitly, which is what keeps a render's fonts an input
    // rather than a property of the directory.
    let dir = temp_dir("no-font-pack");
    assert!(add(&dir, "user-sans", &[]).status.success());
    let templates = dir.join("templates.yml");
    std::fs::write(
        &templates,
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        text: "Hello"
        style: { fontFamily: user-sans }
"#,
    )
    .expect("write template");
    let params = dir.join("params.json");
    std::fs::write(&params, b"{}").expect("write params");

    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(templates),
        "--params",
        &path_arg(params),
        "--output",
        &path_arg(dir.join("out.pdf")),
        "--lang",
        "en-US",
        "--font-dir",
        &path_arg(font_dir()),
        "--font-dir",
        &path_arg(dir.clone()),
        "--locale-dir",
        &path_arg(locale_dir()),
    ]);
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("unknown_font_family"), "stderr: {stderr}");
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

#[test]
fn a_hostile_font_pack_id_cannot_escape_the_font_dir() {
    // `--font-pack` is host input, so it is re-checked by the resolver's own
    // guard rather than trusted for having come from a flag.
    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--output",
        &path_arg(temp_path("never-written.pdf")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--font-pack",
        "../evil",
    ]);
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("not a valid pack id"), "stderr: {stderr}");
    assert!(!temp_path("never-written.pdf").exists());
}
