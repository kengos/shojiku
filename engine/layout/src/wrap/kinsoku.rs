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
/// Membership is `General_Category = Pe`, which is why two groups that do
/// not read like brackets belong here: the white forms `〗〙〛` and the
/// double-prime quotation forms `〞〟` — named "quotation mark" but categorized `Pe`,
/// so they are structural closers rather than part of the ambiguous
/// quote pair [`is_close_quote`] handles.
fn is_close_bracket(c: char) -> bool {
    matches!(
        c,
        '）' | '］'
            | '｝'
            | '〕'
            | '〉'
            | '》'
            | '」'
            | '』'
            | '】'
            | '｣'
            | '〗'
            | '〙'
            | '〛'
            | '〞'
            | '〟'
    )
}

/// Closing quotation marks (line-start kinsoku, all modes): `‘’“”`, the
/// only quotes whose direction the category system leaves to
/// `Pi`/`Pf` rather than `Ps`/`Pe`. UAX #14 files all four under the
/// ambiguous QU class, and its LB19 forbids a break on EITHER side of a
/// quote; this file takes the narrower reading `General_Category` gives —
/// `Pf` (final) closes, `Pi` (initial) opens — so they fall into the same
/// open/close model the brackets use, which is what Chinese practice asks
/// for (GB/T 15834: a closing quote never heads a line, an opening quote
/// never ends one).
///
/// Quiet on Latin text despite being context-free: `‘’“”` are not
/// [`super::is_cjk`], so the tokenizer glues them to the adjacent word
/// (`“Paggawa`, `Rust”`) and a word breaks only at its edges. Between two
/// CJK characters they tokenize alone, which is exactly where the
/// prohibition is wanted. The one Latin path that CAN put a quote at a
/// line edge is the hard break of a token wider than the whole line,
/// where every character is a break point; push-out applies there and
/// keeps the quote with its word, which is the wanted result anyway.
fn is_close_quote(c: char) -> bool {
    matches!(c, '’' | '”')
}

/// Opening quotation marks (line-end kinsoku, all modes): the `Pi` half of
/// the pair [`is_close_quote`] describes. `〝` is NOT here — it is `Ps`,
/// so it sits with the opening brackets in [`no_line_end`].
fn is_open_quote(c: char) -> bool {
    matches!(c, '‘' | '“')
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
///
/// The Chinese interpuncts are left out on the same grounds: `·` (U+00B7)
/// is UAX #14 class **AI** — it resolves to AL or ID by language, and two
/// bundled Latin examples use it as a field separator (`address · tel ·
/// web`), where classifying it would drag a letter off the previous line.
/// `‧` (U+2027) is class **BA**, a break *opportunity* rather than a
/// prohibition. The Chinese dash and ellipsis need no rule either: `——`
/// and `……` are runs of non-[`super::is_cjk`] characters, so the tokenizer
/// already keeps each pair together as one unbreakable word.
///
/// The vertical presentation forms `﹁﹂﹃﹄` are out of scope for a
/// different reason: nothing authors them. `font/vertical/forms.rs` maps
/// `「」『』` onto them at SHAPE time, after wrapping, so the wrapper only
/// ever sees the canonical forms — which are classified above.
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
    if is_close_bracket(c) || is_comma_full_stop(c) || is_close_quote(c) {
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

/// Whether `c` may not end a line (line-end kinsoku): opening brackets
/// (`General_Category = Ps`, so the white forms `〖〘〚` and the `Ps`
/// double-prime form `〝` are here too) plus the two `Pi` opening quotes.
/// Mode-independent — every kinsoku mode keeps these off a line end.
/// Shared with the ellipsis clamp, which must not end a clamped line on
/// one of these before the `…`.
pub(crate) fn no_line_end(c: char) -> bool {
    is_open_quote(c)
        || matches!(
            c,
            '（' | '［'
                | '｛'
                | '〔'
                | '〈'
                | '《'
                | '「'
                | '『'
                | '【'
                | '｢'
                | '〖'
                | '〘'
                | '〚'
                | '〝'
        )
}

#[cfg(test)]
mod tests;
