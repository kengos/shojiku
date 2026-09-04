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
/// caps non-finite numbers, not string sizes).
///
/// This used to be a hand-copied mirror of `shojiku_core::length::snippet`,
/// because that one is crate-private there. Both now call the workspace's
/// one guard, which also strips control characters — neither copy did.
pub(crate) fn snippet(text: &str) -> String {
    shojiku_diagnostics::sanitize_marked(text, 32)
}

#[cfg(test)]
mod tests;
