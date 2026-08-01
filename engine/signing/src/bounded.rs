//! The error-echo decision, in the one form a future variant cannot miss.
//!
//! Both crates on this surface read attacker-chosen bytes, so an error type
//! able to OWN heap data is an unbounded echo of hostile content into
//! whatever logs it. Every variant in both crates is built from `&'static
//! str` and numbers today — but that is a convention, and a convention is
//! re-decided by whoever writes the next variant.
//!
//! So the decision is taken once and handed to the compiler: an error type
//! on this surface owns nothing that needs dropping. `String`, `Vec<u8>`,
//! `PathBuf`, a boxed source, an `Arc<str>` — each makes `needs_drop` true
//! and the crate stops building, with a message saying why. What is left is
//! exactly the vocabulary the variants already use: names and offsets locate
//! a problem without quoting it.
//!
//! The rule is deliberately narrow. It is not "no error anywhere may own a
//! string" — [`shojiku_core`]'s parse errors clip attacker text at
//! construction instead, which is the right answer for a surface whose whole
//! job is to tell an author which key they mistyped. It is the answer for a
//! surface that reads a hostile file and has nothing useful to quote back.
//!
//! (`shojiku-core`'s `CoreError` is that other surface: it clips echoed
//! paths and messages at construction rather than refusing to hold them.)

/// Asserts at compile time that each named error type owns no heap data.
///
/// See the module documentation for why this is an assertion rather than a
/// review convention. A violation fails `const` evaluation of the type it
/// names, so the message points at the variant that reopened the hole.
///
/// ```
/// # use shojiku_signing::assert_errors_are_bounded;
/// #[derive(Debug)]
/// enum ParseError {
///     Malformed { offset: usize, what: &'static str },
/// }
/// assert_errors_are_bounded!(ParseError);
/// ```
#[macro_export]
macro_rules! assert_errors_are_bounded {
    ($($ty:ty),+ $(,)?) => {
        $(
            const _: () = assert!(
                !::core::mem::needs_drop::<$ty>(),
                "an error type on the sign/verify surface may not own heap data: \
                 these errors are built from &'static str and numbers so that a \
                 hostile document's bytes cannot be echoed through them",
            );
        )+
    };
}
