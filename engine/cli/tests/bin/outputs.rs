//! `render`/`preview`/`inspect`: output writing and full pipelines
//! against the bundled examples.

use super::*;

#[test]
fn render_writes_pdf_to_file() {
    let output = temp_path("out.pdf");
    let out = shojiku(&[
        "render",
        "--definitions",
        &path_arg(examples_dir().join("definitions.yml")),
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        &path_arg(output.clone()),
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let bytes = std::fs::read(&output).expect("read pdf");
    std::fs::remove_file(output).expect("cleanup");
    assert!(bytes.starts_with(b"%PDF-"));
}

#[test]
fn render_writes_pdf_to_stdout() {
    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        "-",
    ]);
    assert!(out.status.success());
    assert!(out.stdout.starts_with(b"%PDF-"));
}

#[test]
fn render_to_directory_fails() {
    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        &path_arg(std::env::temp_dir()),
    ]);
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("failed to write output"),
        "stderr: {stderr}"
    );
}

#[test]
fn preview_writes_png_files() {
    let output = temp_path("preview-{page}.png");
    let out = shojiku(&[
        "preview",
        "--definitions",
        &path_arg(examples_dir().join("definitions.yml")),
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--scale",
        "1",
        "--output",
        &path_arg(output),
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    // The single-page example writes preview-1.png.
    let written = temp_path("preview-1.png");
    let bytes = std::fs::read(&written).expect("read preview png");
    assert!(bytes.starts_with(b"\x89PNG"));
    std::fs::remove_file(&written).ok();
}

#[test]
fn imposition_example_validates_and_imposes_data_scoped_cells() {
    // The 2×4 n-up ticket example: validate is clean, then inspect shows each
    // ticket data-scoped to its element, with the first and last element
    // landing across the two imposed sheets.
    let common = [
        "--definitions",
        &path_arg(tickets_dir().join("definitions.yml")),
        "--templates",
        &path_arg(tickets_dir().join("templates.yml")),
        "--params",
        &path_arg(tickets_dir().join("params.json")),
    ];
    let validate = shojiku(&[&["validate"], &common[..]].concat());
    assert!(
        validate.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&validate.stderr)
    );

    let inspect = shojiku(
        &[
            &["inspect"],
            &common[..],
            &[
                "--font-dir",
                &path_arg(font_dir()),
                "--locale-dir",
                &path_arg(locale_dir()),
            ],
        ]
        .concat(),
    );
    assert!(
        inspect.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&inspect.stderr)
    );
    let stdout = String::from_utf8_lossy(&inspect.stdout);
    assert!(stdout.contains("BF26-10-0001"), "first ticket missing");
    assert!(stdout.contains("BF26-12-0014"), "last ticket missing");
}

#[test]
fn inspect_prints_layout_tree() {
    let out = shojiku(&[
        "inspect",
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
    ]);
    assert!(out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("\"pages\""));
    assert!(stdout.contains("領　収　書"));
}
