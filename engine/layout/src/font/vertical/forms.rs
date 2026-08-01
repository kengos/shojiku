//! Vertical presentation forms and cell offsets — the closed v1
//! substitution / nudge tables shared by `char_grid` and the vertical text
//! block. Brackets and dashes substitute to their Unicode vertical
//! presentation forms (the ja fallback chain covers them); 、。 and small
//! kana shift within their cell instead (font-independent); everything else
//! stays as authored. Real `vert`/`vrt2` GSUB is the follow-up that will
//! replace this table.

/// The vertical presentation form for a char, if one exists in the closed
/// v1 map (U+FE30–FE44 subset the bundled fonts cover).
pub(crate) fn vertical_form(c: char) -> Option<char> {
    Some(match c {
        '（' => '︵',
        '）' => '︶',
        '｛' => '︷',
        '｝' => '︸',
        '〔' => '︹',
        '〕' => '︺',
        '【' => '︻',
        '】' => '︼',
        '《' => '︽',
        '》' => '︾',
        '〈' => '︿',
        '〉' => '﹀',
        '「' => '﹁',
        '」' => '﹂',
        '『' => '﹃',
        '』' => '﹄',
        '‥' => '︰',
        '—' => '︱',
        '–' => '︲',
        _ => return None,
    })
}

/// Cell-relative draw offset `(dx, dy)` in cell (em) units for vertical
/// writing: clause punctuation moves to the top-right quadrant, small kana
/// nudge toward the top-right — both are placement conventions the glyphs
/// themselves don't carry, so they work with any font.
pub(crate) fn vertical_offset(c: char) -> (f64, f64) {
    if matches!(c, '、' | '。' | '，' | '．') {
        return (0.5, -0.5);
    }
    if is_small_kana(c) {
        return (0.12, -0.12);
    }
    (0.0, 0.0)
}

/// Small kana: drawn slightly toward the cell's top-right in
/// vertical writing.
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
            | 'ヵ'
            | 'ヶ'
    )
}
