//! The kinsoku character-class tables and the per-mode line-start /
//! line-end prohibition predicates — the single home shared by the line
//! wrapper (`wrap::rich`) and the ellipsis clamp (`engine::text::overflow`).
//! Classes are pure `match` predicates so hostile input never panics. The
//! sets track a pragmatic subset of the CSS Text 3 `line-break` table
//! (`normal` | `strict` | `loose`) rather than the whole of it.
//!
//! Two OTHER bracket tables overlap these deliberately and do NOT share a
//! definition — adding a bracket here may need matching edits there:
//! `font/shape/trim.rs` (half-width punctuation internal-spacing classes; different
//! concern, e.g. it excludes halfwidth forms this file includes) and
//! `engine/char_grid/cells.rs` (the genkoyoshi school-kinsoku set, a closed
//! deliberately-small subset).

use shojiku_core::LineBreak;

/// Closing brackets (line-start kinsoku, all modes): a line never begins with one.
/// No `line-break` value relaxes these (only `anywhere` drops kinsoku).
fn is_close_bracket(c: char) -> bool {
    matches!(
        c,
        '）' | '］' | '｝' | '〕' | '〉' | '》' | '」' | '』' | '】' | '｣'
    )
}

/// Commas and full stops (line-start kinsoku, all modes): CSS `line-break` never
/// relaxes these either (freeing them at a line edge is
/// `hanging-punctuation` territory, not a strictness level). Shared with
/// the hanging-punctuation pass (`wrap::hang`), the single home for this
/// class.
pub(super) fn is_comma_full_stop(c: char) -> bool {
    matches!(c, '、' | '。' | '，' | '．' | '｡' | '､')
}

/// Centered punctuation and inseparables (line-start kinsoku in `normal`/`strict`,
/// allowed in `loose`): the CSS loose-only relaxation bullets — centered
/// marks `・：；･！？‼⁇⁈⁉` and the inseparables `‥…`.
fn is_loose_relaxed_punct(c: char) -> bool {
    matches!(
        c,
        '・' | '：' | '；' | '･' | '！' | '？' | '‼' | '⁇' | '⁈' | '⁉' | '‥' | '…'
    )
}

/// Small kana and the prolonged-sound mark (CSS class CJ; line-start kinsoku in
/// `strict` only): in `normal`/`loose` these may start a line.
fn is_small_kana(c: char) -> bool {
    matches!(
        c,
        'ぁ' | 'ぃ'
            | 'ぅ'
            | 'ぇ'
            | 'ぉ'
            | 'っ'
            | 'ゃ'
            | 'ゅ'
            | 'ょ'
            | 'ゎ'
            | 'ァ'
            | 'ィ'
            | 'ゥ'
            | 'ェ'
            | 'ォ'
            | 'ッ'
            | 'ャ'
            | 'ュ'
            | 'ョ'
            | 'ヮ'
            | 'ー'
    )
}

/// CJK hyphen-likes 〜゠ (line-start kinsoku in `strict` only): CSS allows breaks
/// before them under `normal`/`loose` for Japanese/Chinese text. The
/// Latin hyphens `‐`/`–` are deliberately NOT classified — their CSS rule
/// is conditional on the *preceding* character's class (ID), which a
/// context-free predicate cannot express without disturbing Latin
/// wrapping. The PO/PR (％/￥) classes are unmodelled for the same reason.
fn is_cjk_hyphen(c: char) -> bool {
    matches!(c, '〜' | '゠')
}

/// Iteration marks (line-start kinsoku in `normal`/`strict`, allowed in `loose`).
fn is_iteration_mark(c: char) -> bool {
    matches!(c, '々' | 'ゝ' | 'ゞ' | 'ヽ' | 'ヾ')
}

/// Whether `c` may not begin a line (line-start kinsoku) under `mode`. The sets
/// nest: `loose` ⊂ `normal` ⊂ `strict`. `LineBreak::Anywhere` never
/// reaches here (the wrapper skips kinsoku entirely for it), so it is
/// treated as `loose` for totality.
pub(crate) fn no_line_start(c: char, mode: LineBreak) -> bool {
    // Held off a line start in every kinsoku mode.
    if is_close_bracket(c) || is_comma_full_stop(c) {
        return true;
    }
    match mode {
        // strict adds the CJ class (small kana + ー) and 〜゠ on top of
        // everything normal holds.
        LineBreak::Strict => {
            is_loose_relaxed_punct(c)
                || is_iteration_mark(c)
                || is_small_kana(c)
                || is_cjk_hyphen(c)
        }
        // loose keeps only the always-prohibited classes above.
        LineBreak::Loose | LineBreak::Anywhere => false,
        // normal: centered punctuation, inseparables, and iteration marks
        // held back; small kana and 〜゠ free.
        LineBreak::Normal => is_loose_relaxed_punct(c) || is_iteration_mark(c),
    }
}

/// Whether `c` may not end a line (line-end kinsoku): opening brackets. Mode-
/// independent — every kinsoku mode keeps an opening bracket off a line
/// end. Shared with the ellipsis clamp, which must not end a clamped line
/// on one of these before the `…`.
pub(crate) fn no_line_end(c: char) -> bool {
    matches!(
        c,
        '（' | '［' | '｛' | '〔' | '〈' | '《' | '「' | '『' | '【' | '｢'
    )
}

#[cfg(test)]
mod tests;
