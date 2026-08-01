//! Membership tests for the kinsoku prohibition sets across every mode,
//! pinning the CSS Text 3 `line-break` table subset.

use super::*;

/// The four kinsoku-carrying modes (`anywhere` never reaches the wrapper's
/// kinsoku pass, but `no_line_start` still classifies it — as `loose`).
const MODES: [LineBreak; 4] = [
    LineBreak::Normal,
    LineBreak::Strict,
    LineBreak::Loose,
    LineBreak::Anywhere,
];

#[test]
fn closing_brackets_are_prohibited_at_line_start_in_every_mode() {
    for mode in MODES {
        assert!(no_line_start('）', mode), "） under {mode:?}");
        assert!(no_line_start('」', mode), "」 under {mode:?}");
        assert!(no_line_start('｣', mode), "｣ under {mode:?}");
    }
}

#[test]
fn commas_and_full_stops_are_prohibited_at_line_start_in_every_mode() {
    // CSS `line-break` never relaxes these; only `hanging-punctuation`
    // (not implemented) frees them.
    for mode in MODES {
        assert!(no_line_start('。', mode), "。 under {mode:?}");
        assert!(no_line_start('、', mode), "、 under {mode:?}");
        assert!(no_line_start('．', mode), "． under {mode:?}");
        assert!(no_line_start('｡', mode), "｡ under {mode:?}");
    }
}

#[test]
fn centered_punct_and_inseparables_are_freed_by_loose_only() {
    // The CSS loose relaxation bullets: centered marks and ‥….
    for c in ['・', '：', '；', '！', '？', '‼', '‥', '…'] {
        assert!(no_line_start(c, LineBreak::Normal), "{c} under Normal");
        assert!(no_line_start(c, LineBreak::Strict), "{c} under Strict");
        assert!(!no_line_start(c, LineBreak::Loose), "{c} under Loose");
        assert!(!no_line_start(c, LineBreak::Anywhere), "{c} under Anywhere");
    }
}

#[test]
fn iteration_marks_are_held_in_normal_and_strict_but_free_in_loose() {
    assert!(no_line_start('々', LineBreak::Normal));
    assert!(no_line_start('ゝ', LineBreak::Strict));
    assert!(!no_line_start('々', LineBreak::Loose));
    assert!(!no_line_start('ヾ', LineBreak::Anywhere));
}

#[test]
fn small_kana_prolonged_mark_and_cjk_hyphens_are_held_in_strict_only() {
    // The CJ class plus 〜゠: strict prohibits, normal/loose/anywhere
    // allow (CSS: breaks before them are normal/loose-allowed in ja/zh).
    for c in ['っ', 'ゃ', 'ー', '〜', '゠'] {
        assert!(no_line_start(c, LineBreak::Strict), "{c} under Strict");
        for mode in [LineBreak::Normal, LineBreak::Loose, LineBreak::Anywhere] {
            assert!(!no_line_start(c, mode), "{c} under {mode:?}");
        }
    }
}

#[test]
fn ordinary_characters_never_prohibit_a_line_start() {
    for mode in MODES {
        assert!(!no_line_start('あ', mode), "あ under {mode:?}");
        assert!(!no_line_start('漢', mode), "漢 under {mode:?}");
        assert!(!no_line_start('a', mode), "a under {mode:?}");
    }
}

#[test]
fn opening_brackets_are_the_only_line_end_prohibitions() {
    assert!(no_line_end('「'));
    assert!(no_line_end('（'));
    assert!(no_line_end('【'));
    assert!(!no_line_end('」'));
    assert!(!no_line_end('あ'));
    assert!(!no_line_end('。'));
}
