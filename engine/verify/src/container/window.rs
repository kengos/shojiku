//! Turning a `/Contents` window back into DER.
//!
//! The window is a PDF hexadecimal string — `<` digits `>` — reserved at a
//! fixed width and zero-padded after the container that was written into it.
//! Decoding it is where a hostile document gets its first chance at this
//! crate, so the length is capped before anything is allocated and every
//! character is checked rather than assumed.

use core::ops::Range;

use crate::error::{Result, VerifyError};
use crate::limits::MAX_CONTAINER_BYTES;

/// Decodes the hexadecimal string at `span` (brackets included) into bytes.
pub(crate) fn decode_window(pdf: &[u8], span: &Range<usize>) -> Result<Vec<u8>> {
    let raw = pdf
        .get(span.start..span.end)
        .ok_or(VerifyError::Malformed {
            what: "a signature window inside the document",
        })?;
    let inner = raw
        .strip_prefix(b"<")
        .and_then(|rest| rest.strip_suffix(b">"))
        .ok_or(VerifyError::Malformed {
            what: "a /Contents value that is a hexadecimal string",
        })?;
    if inner.len() % 2 != 0 {
        return Err(VerifyError::Malformed {
            what: "a /Contents string with an even number of hexadecimal digits",
        });
    }
    if inner.len() / 2 > MAX_CONTAINER_BYTES {
        return Err(VerifyError::LimitExceeded {
            what: "bytes in the signature window",
            cap: MAX_CONTAINER_BYTES,
        });
    }
    let mut out = Vec::with_capacity(inner.len() / 2);
    for pair in inner.chunks_exact(2) {
        let (high, low) = (nibble(pair[0])?, nibble(pair[1])?);
        out.push((high << 4) | low);
    }
    Ok(out)
}

/// One hexadecimal digit's value.
fn nibble(byte: u8) -> Result<u8> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(VerifyError::Malformed {
            what: "a /Contents string of hexadecimal digits only",
        }),
    }
}
