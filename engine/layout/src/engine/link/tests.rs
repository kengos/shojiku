//! Unit tests for the URL gate: allowlist, case tricks, hostile values.

use super::{check_link_url, LinkReject, MAX_LINK_URL};

#[test]
fn allowed_schemes_pass_and_trim() {
    for url in [
        "https://example.com/a?b=c",
        "http://例.jp/道",
        "mailto:billing@example.com",
        "tel:+81-3-0000-0000",
    ] {
        assert_eq!(check_link_url(url), Ok(url), "{url}");
    }
    // Leading/trailing whitespace is trimmed, not a bypass vector.
    assert_eq!(
        check_link_url("  https://example.com "),
        Ok("https://example.com")
    );
}

#[test]
fn scheme_matching_ignores_ascii_case_both_ways() {
    assert_eq!(
        check_link_url("HTTPS://EXAMPLE.COM"),
        Ok("HTTPS://EXAMPLE.COM")
    );
    assert_eq!(
        check_link_url("JaVaScRiPt:alert(1)"),
        Err(LinkReject::Scheme)
    );
}

#[test]
fn disallowed_schemes_are_rejected() {
    for url in [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://example.com",
        "//example.com/schemeless",
        "example.com/no-scheme",
        "httpsx://not-https.example",
    ] {
        assert_eq!(check_link_url(url), Err(LinkReject::Scheme), "{url}");
    }
}

#[test]
fn control_characters_are_rejected() {
    assert_eq!(
        check_link_url("https://example.com/\u{0}"),
        Err(LinkReject::Control)
    );
    // An *interior* newline is a control reject, not trimmed away.
    assert_eq!(
        check_link_url("https://exa\nmple.com"),
        Err(LinkReject::Control)
    );
}

#[test]
fn empty_and_oversized_urls_are_rejected() {
    assert_eq!(check_link_url(""), Err(LinkReject::Empty));
    assert_eq!(check_link_url("   \t "), Err(LinkReject::Empty));
    let long = format!("https://example.com/{}", "a".repeat(MAX_LINK_URL));
    assert_eq!(check_link_url(&long), Err(LinkReject::TooLong));
}

// ---- `linked()`: the box-index stamp, read off the drawn items ----
//
// Covered here as well as in the near-e2e box suite because the coverage
// gate measures the crate TWICE — its own unit-test build and the copy
// linked into the integration binary — and a line covered in only one of
// the two still reds the workspace run.

use crate::tree::{
    ClipShape, ImageShape, LayoutItem, LineShape, PathShape, RectShape, TextBlock, TextLine,
    TextRun,
};

fn block(link: Option<&str>, run_links: &[Option<&str>]) -> LayoutItem {
    let runs: Vec<TextRun> = run_links
        .iter()
        .map(|l| TextRun {
            text: "r".to_string(),
            span: 0,
            x: 0.0,
            width: 1.0,
            font_id: "f".to_string(),
            fallback_ids: Vec::new(),
            font_size: 10.0,
            letter_spacing: 0.0,
            color: (0.0, 0.0, 0.0),
            synthetic_bold: false,
            synthetic_italic: false,
            decoration: None,
            link: l.map(str::to_string),
            combine: None,
        })
        .collect();
    LayoutItem::Text(TextBlock {
        font_id: "f".to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 12.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: None,
        link: link.map(str::to_string),
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![TextLine {
            text: "r".to_string(),
            x: 0.0,
            y: 0.0,
            width: 1.0,
            runs,
        }],
    })
}

fn image(link: Option<&str>) -> LayoutItem {
    LayoutItem::Image(ImageShape {
        asset_id: "a".to_string(),
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        opacity: 1.0,
        link: link.map(str::to_string),
    })
}

#[test]
fn a_block_is_linked_by_its_own_url() {
    assert!(super::linked(&[block(Some("https://example.com"), &[])]));
}

#[test]
fn a_block_is_linked_by_any_single_run() {
    // The rich case the box index exists to report: the ITEM is stamped
    // even though only one of its runs carries the link.
    assert!(super::linked(&[block(
        None,
        &[None, Some("https://example.com"), None]
    )]));
}

#[test]
fn a_block_with_no_link_anywhere_is_not_linked() {
    assert!(!super::linked(&[block(None, &[None, None])]));
}

#[test]
fn a_block_with_no_lines_is_not_linked() {
    // The empty-text item: the run loop never runs, which is exactly the
    // case an `any(|…|)` closure would have left uncovered.
    let LayoutItem::Text(mut b) = block(None, &[]) else {
        unreachable!("block() builds a Text item")
    };
    b.lines.clear();
    assert!(!super::linked(&[LayoutItem::Text(b)]));
}

#[test]
fn an_image_carries_its_own_link() {
    assert!(super::linked(&[image(Some("https://example.com"))]));
    assert!(!super::linked(&[image(None)]));
}

#[test]
fn a_clip_group_is_searched_through() {
    // `fit: cover` / `none` wrap the image in a clip; a link inside one
    // must read the same as a link beside one, because the PDF annotation
    // walk recurses identically.
    let clip = LayoutItem::Clip(ClipShape {
        items: vec![image(Some("https://example.com"))],
        ..Default::default()
    });
    assert!(super::linked(&[clip]));
    let empty = LayoutItem::Clip(ClipShape {
        items: vec![image(None)],
        ..Default::default()
    });
    assert!(!super::linked(&[empty]));
}

#[test]
fn shapes_are_never_linked() {
    // A `mark:` oval, a rule and a form mark are not hyperlink targets —
    // the same enumeration the PDF annotation walk makes.
    let shapes = vec![
        LayoutItem::Rect(RectShape {
            w: 1.0,
            h: 1.0,
            ..Default::default()
        }),
        LayoutItem::Line(LineShape {
            x2: 1.0,
            width: 1.0,
            ..Default::default()
        }),
        LayoutItem::Path(PathShape {
            cmds: Vec::new(),
            stroke: None,
            stroke_width: 0.0,
            fill: None,
            opacity: 1.0,
        }),
    ];
    assert!(!super::linked(&shapes));
    // …and a linked item AFTER them is still found: the scan does not stop
    // at the first unlinked entry.
    let mut with_link = shapes;
    with_link.push(image(Some("https://example.com")));
    assert!(super::linked(&with_link));
}
