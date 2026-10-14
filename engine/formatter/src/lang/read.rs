//! Reads a pack file from disk under the pack input cap, so the cap holds at
//! the read and not only at the parse that follows it.
//!
//! The parse doors refuse oversize TEXT, but a whole-file read had already
//! paid for it — and a path that is not a regular file has no size to check:
//! a `manifest.yml` that is a symlink to `/dev/zero` reads forever into
//! memory, and one that is a FIFO blocks the open until something writes.
//! So the path must name a regular file before it is opened, its recorded
//! size must be inside the cap, and the read itself stops one byte past the
//! cap whatever the file turns out to hold by then.

use std::io::{self, Read};
use std::path::Path;

/// The contents of the pack file at `path`, or an I/O error: the OS's own
/// for a missing or unreadable file (so `NotFound` still reads as absence),
/// `InvalidInput` for a path that is not a regular file once symlinks are
/// followed, and `InvalidData` for a file over the cap or not UTF-8.
pub fn read_pack_file(path: &Path) -> io::Result<String> {
    let limit = shojiku_core::MAX_INPUT_BYTES;
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not a regular file; refused unread",
        ));
    }
    let mut bytes = Vec::new();
    if meta.len() <= limit as u64 {
        std::fs::File::open(path)?
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)?;
    }
    if meta.len() > limit as u64 || bytes.len() > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("over the {limit}-byte input cap; refused unread past it"),
        ));
    }
    String::from_utf8(bytes).map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))
}

#[cfg(test)]
mod tests;
