//! `#rrggbb` color parsing.

/// Parses a `#rrggbb` hex color into normalized RGB. Returns `None` for
/// anything malformed (callers fall back to black and warn).
pub fn parse_color(input: &str) -> Option<(f32, f32, f32)> {
    let hex = input.strip_prefix('#')?;
    if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((
        f32::from(r) / 255.0,
        f32::from(g) / 255.0,
        f32::from(b) / 255.0,
    ))
}

/// Truncates a template-supplied color string before echoing it into a
/// diagnostic: colors are attacker-controlled and unbounded (yaml_guard
/// caps non-finite numbers, not string sizes). Mirrors
/// `shojiku_core::length::snippet` (crate-private there).
pub(crate) fn snippet(text: &str) -> String {
    const MAX_CHARS: usize = 32;
    if text.chars().count() <= MAX_CHARS {
        text.to_string()
    } else {
        let head: String = text.chars().take(MAX_CHARS).collect();
        format!("{head}…")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_colors() {
        assert_eq!(parse_color("#000000"), Some((0.0, 0.0, 0.0)));
        assert_eq!(parse_color("#ffffff"), Some((1.0, 1.0, 1.0)));
        let (r, g, b) = parse_color("#336699").expect("color");
        assert!((r - 0.2).abs() < 0.01);
        assert!((g - 0.4).abs() < 0.01);
        assert!((b - 0.6).abs() < 0.01);
    }

    #[test]
    fn rejects_malformed_colors() {
        assert_eq!(parse_color("336699"), None);
        assert_eq!(parse_color("#33669"), None);
        assert_eq!(parse_color("#3366999"), None);
        assert_eq!(parse_color("#zzzzzz"), None);
        assert_eq!(parse_color(""), None);
    }
}
