//! The closed presentation-form / cell-offset tables: full membership
//! pins, so an accidental edit to the degrade path's data is visible.

use super::super::{vertical_form, vertical_offset};

#[test]
fn vertical_forms_cover_the_whole_closed_table() {
    let table = [
        ('（', '︵'),
        ('）', '︶'),
        ('｛', '︷'),
        ('｝', '︸'),
        ('〔', '︹'),
        ('〕', '︺'),
        ('【', '︻'),
        ('】', '︼'),
        ('《', '︽'),
        ('》', '︾'),
        ('〈', '︿'),
        ('〉', '﹀'),
        ('「', '﹁'),
        ('」', '﹂'),
        ('『', '﹃'),
        ('』', '﹄'),
        ('‥', '︰'),
        ('—', '︱'),
        ('–', '︲'),
    ];
    for (plain, form) in table {
        assert_eq!(vertical_form(plain), Some(form), "{plain}");
    }
    assert_eq!(vertical_form('あ'), None);
}

#[test]
fn vertical_offsets_shift_punctuation_and_small_kana() {
    assert_eq!(vertical_offset('。'), (0.5, -0.5));
    assert_eq!(vertical_offset('っ'), (0.12, -0.12));
    assert_eq!(vertical_offset('あ'), (0.0, 0.0));
}
