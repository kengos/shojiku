//! Hard bounds on everything a parsed document can drive.
//!
//! Every loop and every allocation in this crate is bounded by a constant
//! here, because the same parser is reused by the verifier on bytes an
//! attacker chose: a file may claim a million-deep `/Prev` chain or a
//! dictionary nested until the stack gives out, and the answer must be a
//! structured error rather than a crash. The values are deliberately far
//! above what this engine's own output needs (a rendered document has one
//! cross-reference section, no nesting past a handful of levels) and far
//! below what would exhaust memory.

/// Cross-reference sections followed through `/Prev` before giving up.
pub(crate) const MAX_XREF_CHAIN: usize = 32;

/// Entries accepted across all cross-reference sections of one document.
pub(crate) const MAX_XREF_ENTRIES: usize = 1 << 20;

/// Nesting depth for dictionaries and arrays while scanning one value.
pub(crate) const MAX_NESTING_DEPTH: usize = 64;

/// Entries accepted in one dictionary.
pub(crate) const MAX_DICT_ENTRIES: usize = 4096;

/// Levels descended through the page tree looking for the first page.
pub(crate) const MAX_PAGE_TREE_DEPTH: usize = 32;

/// Digits accepted in one integer token (bounds the accumulation loop
/// independently of the checked arithmetic that also guards it).
pub(crate) const MAX_INT_DIGITS: usize = 20;

/// How far back from end-of-file the `startxref` keyword is looked for.
pub(crate) const TAIL_SCAN_WINDOW: usize = 2048;

/// Object number ceiling; also bounds how many objects one revision adds.
pub(crate) const MAX_OBJECT_NUMBER: u32 = 8_388_607;

/// Width of each `/ByteRange` field, in digits. The field is written padded
/// so the real offsets can overwrite it without moving any other byte, so
/// this doubles as the largest signable file size (10 digits ≈ 10 GB).
pub(crate) const BYTE_RANGE_DIGITS: usize = 10;

/// Largest byte offset expressible in a fixed-width cross-reference or
/// `/ByteRange` field — the ceiling [`BYTE_RANGE_DIGITS`] implies.
pub(crate) const MAX_FIXED_WIDTH_OFFSET: usize = 9_999_999_999;

/// Smallest `/Contents` window a caller may reserve, in bytes.
pub const MIN_CONTENTS_CAPACITY: usize = 512;

/// Largest `/Contents` window a caller may reserve, in bytes.
pub const MAX_CONTENTS_CAPACITY: usize = 64 * 1024;

/// Default `/Contents` window, in bytes. Sized for a CMS `SignedData` with a
/// certificate chain, and measured against the real thing: the largest
/// container this release can produce — a 4096-bit signature under a
/// 4096-bit certificate, the backend's own ceiling — is about 2 kB, so the
/// default holds it with room to spare. An in-crate test asserts that
/// headroom, which is what fails first if a container ever grows toward the
/// window rather than a document failing to sign in the field.
pub const DEFAULT_CONTENTS_CAPACITY: usize = 8192;
