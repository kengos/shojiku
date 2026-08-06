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
fn zh_closing_white_brackets_are_prohibited_at_line_start_in_every_mode() {
    // UAX #14 class CL, like the brackets already listed: no strictness
    // level frees them.
    for c in ['〗', '〙', '〛'] {
        for mode in MODES {
            assert!(no_line_start(c, mode), "{c} under {mode:?}");
        }
    }
}

#[test]
fn zh_opening_white_brackets_are_prohibited_at_line_end() {
    // Class OP, and only the opening halves — the closing ones are a
    // line-START prohibition and must not leak into the line-end set.
    for c in ['〖', '〘', '〚'] {
        assert!(no_line_end(c), "{c} should not end a line");
    }
    for c in ['〗', '〙', '〛'] {
        assert!(!no_line_end(c), "{c} may end a line");
    }
}

#[test]
fn closing_quotes_are_prohibited_at_line_start_in_every_mode() {
    // The Pf (final) half of UAX #14's QU class — Chinese text's primary
    // quotation marks. Held in every mode, like the closing brackets.
    for c in ['’', '”'] {
        for mode in MODES {
            assert!(no_line_start(c, mode), "{c} under {mode:?}");
        }
    }
}

#[test]
fn opening_quotes_are_prohibited_at_line_end() {
    // The Pi (initial) half. The Pf half must NOT be line-end prohibited:
    // the asymmetry is the whole point of splitting QU by category.
    for c in ['‘', '“'] {
        assert!(no_line_end(c), "{c} should not end a line");
    }
    for c in ['’', '”'] {
        assert!(!no_line_end(c), "{c} may end a line");
    }
}

#[test]
fn double_prime_quotation_forms_are_classified_as_brackets_not_quotes() {
    // `〝〞〟` read as quotation marks but are categorized Ps/Pe, so they
    // are structural open/close like `〖〗` — NOT the Pi/Pf pair. Pinning
    // the direction is what stops the two groups being confused again.
    for mode in MODES {
        assert!(no_line_start('〞', mode), "〞 under {mode:?}");
        assert!(no_line_start('〟', mode), "〟 under {mode:?}");
        assert!(
            !no_line_start('〝', mode),
            "〝 may start a line under {mode:?}"
        );
    }
    assert!(no_line_end('〝'), "〝 should not end a line");
    assert!(!no_line_end('〞'), "〞 may end a line");
    assert!(!no_line_end('〟'), "〟 may end a line");
}

#[test]
fn ambiguous_and_break_after_marks_stay_unclassified() {
    // `·` is class AI (language-dependent — it separates Latin fields in
    // bundled examples), `‧` is BA, `—` is B2. None is a prohibition
    // class, so none may be held off either line edge in any mode.
    for c in ['·', '‧', '—'] {
        for mode in MODES {
            assert!(!no_line_start(c, mode), "{c} under {mode:?}");
        }
        assert!(!no_line_end(c), "{c} at a line end");
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
