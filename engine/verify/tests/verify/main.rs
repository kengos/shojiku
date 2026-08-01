//! Near-e2e verification over the COMMITTED example output.
//!
//! The unit tests run over synthetic documents whose every byte is known,
//! which is what a hostile-shape test needs. These run over the real thing:
//! `examples/*/output.pdf`, byte-pinned by the examples gate, signed with
//! freshly generated keys and then verified. A signer and a verifier written
//! beside each other will agree on any pair of mistakes they share, so the
//! documents here are the ones a user would actually hand over.

mod chain;
mod common;
mod corpus;
mod coverage;
mod echo;
mod hostile;
mod roundtrip;
mod tamper;
