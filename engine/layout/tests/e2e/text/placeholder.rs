//! Blank-form `placeholder` end to end. Split by concern: the
//! absent/null/`""` trigger matrix on a plain binding ([`trigger`]), and
//! the per-context routing + field-level + hostile-input cases
//! ([`context`]).

mod context;
mod trigger;
