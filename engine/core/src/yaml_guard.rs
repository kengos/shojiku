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
mod tests {
    use super::*;

    fn parse(s: &str) -> serde_yaml::Value {
        serde_yaml::from_str(s).expect("yaml")
    }

    #[test]
    fn finite_documents_pass() {
        assert!(ensure_finite(&parse("a: {b: [1, 2.5, -3]}"), "doc").is_ok());
        assert!(ensure_finite(&parse("plain string"), "doc").is_ok());
    }

    #[test]
    fn nan_and_inf_are_rejected_at_any_depth() {
        assert!(ensure_finite(&parse("a: .nan"), "doc").is_err());
        assert!(ensure_finite(&parse("a: [1, {b: .inf}]"), "doc").is_err());
        assert!(ensure_finite(&parse("a: -.inf"), "doc").is_err());
    }

    #[test]
    fn the_cap_is_sixteen_mebibytes() {
        // The boundary tests below are written RELATIVE to the constant, so
        // they hold for ANY value of it — including a value nobody chose.
        // This is the one assertion that pins the number itself, and it is
        // the number the CHANGELOG and the docs quote.
        assert_eq!(MAX_INPUT_BYTES, 16 * 1024 * 1024);
    }

    #[test]
    fn at_the_cap_is_admitted_and_one_byte_past_it_is_refused() {
        // The boundary pair. `MAX_INPUT_BYTES` is the largest ACCEPTED
        // size, so the admitted maximum must parse rather than merely
        // "not panic" — an off-by-one here silently rejects a legal
        // document.
        let filler = "#".repeat(MAX_INPUT_BYTES - "a: 1\n".len());
        let at_cap = format!("a: 1\n{filler}");
        assert_eq!(at_cap.len(), MAX_INPUT_BYTES);
        assert!(ensure_bounded_size(&at_cap, "doc").is_ok());

        let past_cap = format!("{at_cap}#");
        let err = ensure_bounded_size(&past_cap, "doc").expect_err("one byte over");
        // `matches!` rather than a let-else: the else arm's `panic!` is a
        // line no passing test can reach, and the 100%-lines gate counts
        // test code too.
        assert!(
            matches!(
                err,
                CoreError::TooLarge { what: "doc", bytes, limit }
                    if bytes == MAX_INPUT_BYTES + 1 && limit == MAX_INPUT_BYTES
            ),
            "got: {err:?}"
        );
    }

    #[test]
    fn the_size_refusal_quotes_none_of_the_input() {
        // A refusal must not echo a document nobody vetted. The rendered
        // message is two numbers and the artifact name — the marker below
        // is in the input and must not reach the message.
        let marker = "SECRET-\u{1b}]0;pwned\u{7}";
        let oversize = format!("{marker}{}", "#".repeat(MAX_INPUT_BYTES));
        let err = ensure_bounded_size(&oversize, "template").expect_err("over");
        let rendered = err.to_string();
        assert!(!rendered.contains("SECRET"), "message: {rendered}");
        assert!(!rendered.contains('\u{1b}'), "message: {rendered}");
        assert!(rendered.contains("template"));
        // …and the same holds through the diagnostic the GUI reads.
        let diag = err.to_diagnostic();
        let args = format!("{:?}", diag);
        assert!(!args.contains("SECRET"), "diagnostic: {args}");
    }

    /// The YAML parser's OWN limits, pinned. Nothing in this crate enforces
    /// either one — `serde_yaml` (over unsafe-libyaml) refuses first — which
    /// is exactly why they are worth a test: swap the parser and these are
    /// the two holes that would reopen with no other gate noticing.
    #[test]
    fn the_yaml_parser_refuses_runaway_nesting_before_the_finiteness_walk() {
        // `has_non_finite` recurses per nesting level with no bound of its
        // own. It is safe only because nothing deeper than this ever
        // reaches it.
        let deep = format!("{}x{}", "[".repeat(128), "]".repeat(128));
        assert!(
            serde_yaml::from_str::<serde_yaml::Value>(&deep).is_ok(),
            "128 is the admitted maximum"
        );
        let deeper = format!("{}x{}", "[".repeat(129), "]".repeat(129));
        assert!(serde_yaml::from_str::<serde_yaml::Value>(&deeper).is_err());
        // A pathological-but-legal document still walks fine.
        assert!(ensure_finite(&parse(&deep), "doc").is_ok());
    }

    #[test]
    fn the_yaml_parser_refuses_runaway_alias_expansion_at_this_input_size() {
        // The billion-laughs shape at ~200 source bytes. The limit this
        // pins is REAL but it is not a constant: serde_yaml's repetition
        // budget is `events.len() * 100`, so it scales with the input and
        // a padded document buys a proportionally bigger bomb (see the
        // module doc). What this test pins is that the budget exists at
        // all and that a small bomb cannot walk past it — not that
        // amplification is bounded in general.
        let laughs = |levels: usize| {
            let mut src = String::from("a0: &a0 \"x\"\n");
            for i in 1..=levels {
                let prev = format!("*a{}", i - 1);
                let refs = vec![prev; 10].join(", ");
                src.push_str(&format!("a{i}: &a{i} [{refs}]\n"));
            }
            src.push_str(&format!("root: *a{levels}\n"));
            src
        };
        // Positive control: the shape itself parses, so the refusal below
        // is the LIMIT talking and not a syntax error in the fixture.
        assert!(serde_yaml::from_str::<serde_yaml::Value>(&laughs(3)).is_ok());
        let err = serde_yaml::from_str::<serde_yaml::Value>(&laughs(4))
            .expect_err("the repetition limit must refuse this");
        assert!(err.to_string().contains("repetition"), "got: {err}");
    }

    #[test]
    fn tagged_values_are_inspected() {
        assert!(ensure_finite(&parse("a: !custom .inf"), "doc").is_err());
        assert!(ensure_finite(&parse("a: !custom 1.5"), "doc").is_ok());
    }
}
