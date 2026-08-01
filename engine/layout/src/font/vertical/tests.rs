//! Unit coverage for the vertical classification layer: the full UAX#50
//! orientation classifier (membership, range boundaries, totality) and
//! the vmtx-backed per-char down-advance estimate. The shaped ARRANGEMENT
//! tests live in [`arrange`], the per-char fallback in [`degrade`].

use super::*;
use crate::font::test_support::ja_store;
use shojiku_core::TextOrientation::{Mixed, Upright};

mod arrange;
mod combine;
mod degrade;
mod forms;

#[test]
fn mixed_follows_uax50_vertical_orientation() {
    // Upright: CJK/kana/Hangul/fullwidth (U), the small-kana Tu class, and
    // the Tr transforms (ー 長音, 〜) whose rotation rides GSUB `vert`.
    // 𠮷 is a supplementary-plane ideograph; § is a UAX#50 U oddity the
    // closed v1 set got wrong.
    for c in [
        '漢', 'あ', 'カ', '、', '「', '％', '𠮷', '한', 'ᄀ', 'ー', '〜', 'ぁ', '§',
    ] {
        assert_eq!(orientation(c, Mixed), Orientation::Upright, "{c}");
    }
    // Rotated: the R default — Latin/digits, and halfwidth katakana
    // (upright under the closed v1 range set; UAX#50 rotates them).
    for c in ['A', '1', '!', 'z', 'é', 'ｱ'] {
        assert_eq!(orientation(c, Mixed), Orientation::Rotated, "{c}");
    }
}

#[test]
fn uax50_range_boundaries_pin_the_generated_table() {
    // Hangul Jamo 1100..11FF is U; its neighbours on both sides are R
    // (10FF Georgian, 1200 Ethiopic) — pins the binary search at range
    // edges against the fetched VerticalOrientation.txt.
    assert_eq!(orientation('\u{10FF}', Mixed), Orientation::Rotated);
    assert_eq!(orientation('\u{1100}', Mixed), Orientation::Upright);
    assert_eq!(orientation('\u{11FF}', Mixed), Orientation::Upright);
    assert_eq!(orientation('\u{1200}', Mixed), Orientation::Rotated);
}

#[test]
fn uax50_lookup_is_total_over_char() {
    // Plane-16 private use defaults U through 10FFFD; the trailing
    // noncharacters fall back to R. No panic anywhere in char space.
    assert_eq!(orientation('\u{F0000}', Mixed), Orientation::Upright);
    assert_eq!(orientation('\u{10FFFD}', Mixed), Orientation::Upright);
    assert_eq!(orientation('\u{10FFFF}', Mixed), Orientation::Rotated);
    assert_eq!(orientation('\u{0}', Mixed), Orientation::Rotated);
}

#[test]
fn upright_orientation_forces_every_char_upright() {
    for c in ['A', '1', '漢', '!'] {
        assert_eq!(orientation(c, Upright), Orientation::Upright, "{c}");
    }
}

#[test]
fn down_advance_upright_reads_the_real_vmtx_advance() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // BIZ UD's vmtx advance for a full-width glyph is exactly 1em (2048
    // units at upem 2048) — the estimate now reads the same table shaping
    // advances by.
    let up = down_advance(face, '漢', 10.0, Mixed);
    assert!((up - 10.0).abs() < 1e-9, "vmtx em advance, got {up}");
    // A rotated Latin glyph advances by its (narrower) horizontal advance.
    let rot = down_advance(face, 'A', 10.0, Mixed);
    assert!((rot - face.advance('A', 10.0)).abs() < 1e-9, "rot {rot}");
    assert!(rot < up);
}
