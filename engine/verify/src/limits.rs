//! Hard bounds on everything a signed document can drive.
//!
//! The same reasoning as the signing crate's `limits`: a file may claim a
//! thousand-long certificate chain or a signature field list that never
//! ends, and the answer must be a structured error rather than a crash or an
//! unbounded allocation. Values sit far above what a document this engine
//! produced needs (one signature, one or two certificates) and far below
//! anything that would exhaust memory.

// There is deliberately NO chain-depth constant. The walk in `chain` is
// bounded by the certificates it can reach — the anchors and the container's
// own set, both capped below — and by refusing to revisit one, which is a
// proof rather than a number chosen to look safe.

/// Trust anchors accepted from one caller-supplied PEM input.
pub(crate) const MAX_TRUST_ANCHORS: usize = 64;

/// Entries read from an interactive form's `/Fields` array.
pub(crate) const MAX_FORM_FIELDS: usize = 1024;

/// Certificates read out of one signature container.
pub(crate) const MAX_CONTAINER_CERTIFICATES: usize = 32;

/// Bytes accepted from a `/Contents` window, matching the largest window the
/// signing crate will reserve.
pub(crate) const MAX_CONTAINER_BYTES: usize = shojiku_signing::MAX_CONTENTS_CAPACITY;
