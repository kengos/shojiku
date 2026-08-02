//! Host-level font fetching: the layer that turns a *pinned reference* in a
//! pack manifest (`sha256` + an optional `url:` hint) into bytes on disk,
//! before any rendering starts.
//!
//! It is a deliberate NON-goal for the engine to fetch anything: layout,
//! render, sign, and verify stay socket-free so the same inputs produce the
//! same bytes on any machine. Fetching is *cache-filling distribution* and
//! lives here, in a crate only hosts depend on (today: `shojiku-cli`).
//!
//! The integrity model is pin-first: the manifest `sha256` is the guarantee and
//! `url:` is only a hint about where the bytes might be found. Fetched bytes
//! match the pin exactly or the run fails loudly — there is no "close enough"
//! fallback, because a silently different font is a silently different
//! document. The host allowlist ([`FetchPolicy`]) is defense-in-depth on top,
//! bounding where a hostile manifest can point the host.

mod cache;
mod ensure;
mod error;
mod policy;
mod read;
mod transport;

pub use cache::{default_cache_root, FontCache};
pub use ensure::{ensure_faces, FetchReport, Mode};
pub use error::{FetchError, TransportError};
pub use policy::{FetchPolicy, DEFAULT_ALLOWED_HOSTS};
pub use read::{Hashed, MAX_FACE_BYTES};
pub use transport::{HttpTransport, Transport};
