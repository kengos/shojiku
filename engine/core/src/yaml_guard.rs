//! Input sanitation shared by the YAML/JSON parse entry points.
//!
//! YAML accepts `.nan` / `.inf` literals. Non-finite numbers poison every
//! geometry computation downstream, and `serde_json` silently converts
//! them to `null`, so they must be rejected at the parse boundary — this
//! is the single choke point untrusted documents pass through.
//!
//! It is also where an input's SIZE is bounded, and what that bound does
//! and does not cover is worth stating precisely, because two neighbouring
//! limits are easy to conflate with it.
//!
//! **Nesting depth is the parser's, and it holds.** serde_yaml refuses
//! anything past depth 128 (measured: 128 parses, 129 is
//! `recursion limit exceeded`), which is what makes `has_non_finite`'s
//! unbounded recursion safe — it is bounded by construction rather than by
//! anything here. A test in this module pins that, since nothing in this
//! workspace enforces it and swapping the parser would reopen it silently.
//!
//! **Alias amplification is NOT bounded to a constant, and this cap does
//! not close it.** serde_yaml's repetition limit is `events.len() * 100` —
//! it SCALES with the input — so the ceiling is not the few thousand nodes
//! a small bomb reaches. Measured on this parser: a 197-byte bomb tops out
//! at 2,351 nodes, but padding the same document to 400 KB raises the
//! ceiling to 2,545,689, and the ratio holds at roughly 6 nodes per source
//! byte. A document comfortably inside [`MAX_INPUT_BYTES`] can therefore
//! still expand to order 10^8 nodes. Closing that needs a bound on alias
//! RESOLUTIONS, which is inside the parser rather than out here; the
//! Designer holds the browser side with `MAX_ALIAS_COUNT` over a different
//! YAML library. Until the engine has its own, this is a known exposure
//! and is documented as one rather than implied away.
//!
//! So what [`MAX_INPUT_BYTES`] actually buys is the plain cost of a very
//! large document — which this crate pays TWICE, once to a `Value` for the
//! checks and once to the typed model for the located errors — and, through
//! the ratio above, an outer bound on the amplified cost as well.
//! `ensure_bounded_size` runs before either parse, so an oversize input is
//! refused without being read into a tree at all.

use crate::error::CoreError;

/// The largest authored input any parse door will accept, in bytes.
///
/// 16 MiB — twice the Designer's documented 8 MiB template ceiling, so no
/// legal document is anywhere near it, while a hostile one cannot make the
/// engine hold and walk an arbitrarily large tree. The MCP surface keeps
/// its own, much tighter inline cap (512 KiB) for its own reasons.
pub const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

/// Returns an error if `input` is larger than [`MAX_INPUT_BYTES`].
///
/// Call this BEFORE parsing: the point is to refuse the bytes, not to
/// discover afterwards how big the tree got. The error carries only
/// numbers, never any of the input.
///
/// Crate-private on purpose. Other crates need their OWN error type for
/// the same refusal (the formatter reports `LangPackError::TooLarge`), so
/// what they share is [`MAX_INPUT_BYTES`] — one number in one place —
/// rather than a function they would have to wrap anyway. `shojiku-formatter`
/// funnels all four of its pack doors through a single `ensure_pack_size`
/// for the same reason a convention to "call the check here" does not
/// survive: it becomes N divergent copies.
pub(crate) fn ensure_bounded_size(input: &str, what: &'static str) -> Result<(), CoreError> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(CoreError::TooLarge {
            what,
            bytes: input.len(),
            limit: MAX_INPUT_BYTES,
        });
    }
    Ok(())
}

/// Returns an error if any number anywhere in the document is NaN/Infinity.
pub(crate) fn ensure_finite(
    value: &serde_yaml::Value,
    what: &'static str,
) -> Result<(), CoreError> {
    if has_non_finite(value) {
        return Err(CoreError::NonFinite(what));
    }
    Ok(())
}

fn has_non_finite(value: &serde_yaml::Value) -> bool {
    match value {
        serde_yaml::Value::Number(n) => n.as_f64().is_some_and(|f| !f.is_finite()),
        serde_yaml::Value::Sequence(items) => items.iter().any(has_non_finite),
        serde_yaml::Value::Mapping(map) => map
            .iter()
            .any(|(k, v)| has_non_finite(k) || has_non_finite(v)),
        serde_yaml::Value::Tagged(tagged) => has_non_finite(&tagged.value),
        _ => false,
    }
}

#[cfg(test)]
mod tests;
