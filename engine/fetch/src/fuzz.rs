//! The redirect-chain harness the `fetch_redirects` fuzz target and the
//! corpus replay test both run.
//!
//! The property under test is the one the allowlist exists for: no request
//! is ever handed to the transport for a URL outside the default allowlist,
//! however the declared `url:` and the `Location` values of the redirect
//! hops are spelled. The harness drives the public [`ensure_faces`] with a
//! scripted transport, so the declared URL, the private `Location`
//! resolution and the per-hop [`FetchPolicy::check`] all run in their real
//! order, and the transport itself asserts the property on every request it
//! receives. A broken invariant is a panic, which is what a fuzzer reports.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

use crate::{
    DEFAULT_ALLOWED_HOSTS, FetchPolicy, FontCache, Hashed, Mode, Transport, TransportError,
    ensure_faces,
};
use shojiku_diagnostics::{Echo, MAX_ECHO};
use shojiku_formatter::FaceSpec;
use std::cell::RefCell;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::path::PathBuf;
use ureq::http::Uri;

#[cfg(test)]
mod tests;

/// The most transport requests one face may cause: the declared URL plus
/// three redirect hops (`ensure`'s private redirect limit).
const MAX_REQUESTS: usize = 4;

/// An upper bound, in characters, on any `FetchError` message: six echoed
/// values (each at most [`MAX_ECHO`] characters plus a truncation mark) and
/// the fixed prose around them. The variant that echoes the most values,
/// `FetchError::Sha256Mismatch`, echoes five; the sixth is a margin.
const MAX_ERROR_CHARS: usize = 6 * (MAX_ECHO + 1) + 512;

/// Runs one fuzz input through [`ensure_faces`] under the default policy and
/// returns how many requests reached the transport.
///
/// The first line of `input` is the face's declared `url:`; each further
/// line is the `Location` the scripted transport answers the next request
/// with. After the last `Location` line, the transport answers with a body
/// whose digest does not match the face's pin, so nothing is ever written to
/// the cache.
///
/// # Panics
///
/// Panics when the transport receives a URL that [`independently_allowed`]
/// refuses, when one face causes more than four transport requests, when
/// `ensure_faces` succeeds (no scripted body matches the pin), or when the
/// returned error message is longer than [`MAX_ERROR_CHARS`].
pub fn redirect_chain(input: &str) -> usize {
    run_chain(input, &FetchPolicy::default())
}

/// [`redirect_chain`] under a caller-chosen policy. A policy wider than the
/// default is how the unit tests prove that the transport's assertion fires.
fn run_chain(input: &str, policy: &FetchPolicy) -> usize {
    let mut lines = input.lines();
    let Some(url) = lines.next() else {
        return 0;
    };
    let transport = Scripted {
        locations: lines.collect(),
        requests: RefCell::new(Vec::new()),
    };
    let spec = FaceSpec {
        id: "fuzz".to_string(),
        // An absolute path that cannot exist, so `ensure_faces` treats the
        // face as missing and goes to the transport.
        path: PathBuf::from("/nonexistent/shojiku-fuzz/face.ttf"),
        family: "fuzz".to_string(),
        weight: Default::default(),
        style: Default::default(),
        sha256: "0".repeat(64),
        embedding_attested: false,
        url: Some(url.to_string()),
        pack: "fuzz".to_string(),
    };
    // A cache root that does not exist: a lookup misses, and the digest
    // mismatch below means no fetched body ever reaches `put`.
    let cache = FontCache::new(PathBuf::from("/nonexistent/shojiku-fuzz/cache"));
    let result = ensure_faces(vec![spec], &cache, policy, &transport, Mode::Online);
    let requests = transport.requests.borrow().len();
    assert!(
        requests <= MAX_REQUESTS,
        "one face caused {requests} transport requests"
    );
    assert!(
        result.is_err(),
        "ensure_faces accepted a body whose digest does not match the pin"
    );
    let chars = result
        .err()
        .map_or(0, |error| error.to_string().chars().count());
    assert!(
        chars <= MAX_ERROR_CHARS,
        "a fetch error message is {chars} characters long"
    );
    requests
}

/// A transport that answers from a script and asserts the allowlist on
/// every request it receives.
struct Scripted<'a> {
    locations: Vec<&'a str>,
    requests: RefCell<Vec<String>>,
}

impl Transport for Scripted<'_> {
    fn get(&self, url: &str, _cap: u64) -> Result<Hashed, TransportError> {
        assert!(
            independently_allowed(url),
            "the transport was asked to fetch a URL outside the default allowlist: {url:?}"
        );
        let mut requests = self.requests.borrow_mut();
        let index = requests.len();
        requests.push(url.to_string());
        match self.locations.get(index) {
            Some(location) => Err(TransportError::Redirect(Echo::from(*location))),
            None => Ok(Hashed {
                bytes: Vec::new(),
                sha256: "f".repeat(64),
            }),
        }
    }
}

/// Whether `url` is one the default policy may send to the network, decided
/// without calling [`FetchPolicy::check`]: an `https` URL with no userinfo,
/// whose host is a name (not an IPv4 or IPv6 literal) equal to an entry of
/// [`DEFAULT_ALLOWED_HOSTS`] or ending in `.` followed by one.
fn independently_allowed(url: &str) -> bool {
    let Ok(uri) = url.parse::<Uri>() else {
        return false;
    };
    let authority = uri.authority().map_or("", |a| a.as_str());
    let host = uri.host().unwrap_or_default().to_ascii_lowercase();
    let bracketed = host.trim_start_matches('[').trim_end_matches(']');
    uri.scheme_str() == Some("https")
        && !authority.contains('@')
        && host.parse::<Ipv4Addr>().is_err()
        && bracketed.parse::<Ipv6Addr>().is_err()
        && DEFAULT_ALLOWED_HOSTS.iter().any(|allowed| {
            host == *allowed
                || host
                    .strip_suffix(allowed)
                    .is_some_and(|prefix| prefix.ends_with('.'))
        })
}
