//! Number rendering shared by every numeric type: precision clamping,
//! trailing-zero trimming, and locale-separator grouping.

use crate::lang::{LangPack, NumberSpec};

/// Upper bound on decimal places. `precision` comes from untrusted
/// definitions/lang-pack input; an unclamped value like `u32::MAX` would
/// make `format!` try to allocate a multi-gigabyte string (DoS). f64 has
/// no meaningful precision beyond ~17 significant digits anyway.
const MAX_PRECISION: u32 = 20;

/// Formats a number with grouping. `precision: None` trims trailing zeros
/// (up to 2 decimal places); `Some(p)` renders exactly `p` decimals
/// (clamped to [`MAX_PRECISION`]).
pub(super) fn format_number(value: f64, precision: Option<u32>, pack: &LangPack) -> String {
    let rendered = match precision {
        Some(p) => format!("{value:.*}", p.min(MAX_PRECISION) as usize),
        None => trim_number(value),
    };
    let (int_part, frac_part) = match rendered.split_once('.') {
        Some((i, f)) => (i.to_string(), Some(f.to_string())),
        None => (rendered, None),
    };
    let grouped = group_integer(&int_part, &pack.number);
    match frac_part {
        Some(f) => format!("{grouped}{}{f}", pack.number.decimal_separator),
        None => grouped,
    }
}

/// Renders a float without trailing zeros, keeping at most 2 decimals.
fn trim_number(value: f64) -> String {
    // `{:.2}` always emits at least one integer digit, so trimming the
    // trailing zeros and dot can never produce an empty string.
    let s = format!("{value:.2}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn group_integer(int_part: &str, spec: &NumberSpec) -> String {
    let (sign, digits) = match int_part.strip_prefix('-') {
        Some(rest) => ("-", rest),
        None => ("", int_part),
    };
    // Sizes come from an untrusted locale pack: 0 would mean "a group every
    // zero digits" (and `% 0` panics), so it disables grouping instead. A
    // huge size simply never matches, which is also "no grouping".
    let primary = usize::try_from(spec.group_size).unwrap_or(usize::MAX);
    let secondary = match spec.secondary_group_size {
        Some(0) | None => primary,
        Some(n) => usize::try_from(n).unwrap_or(usize::MAX),
    };
    if primary == 0 {
        return format!("{sign}{digits}");
    }
    let chars: Vec<char> = digits.chars().collect();
    let mut grouped = String::new();
    for (i, c) in chars.iter().enumerate() {
        // `remaining` digits sit to the right of (and including) this one; a
        // separator opens the first group at `primary`, then every
        // `secondary` beyond it — uniform when the two sizes are equal.
        let remaining = chars.len() - i;
        let boundary = remaining == primary
            || (remaining > primary && (remaining - primary).is_multiple_of(secondary));
        if i > 0 && boundary {
            grouped.push_str(&spec.group_separator);
        }
        grouped.push(*c);
    }
    format!("{sign}{grouped}")
}
