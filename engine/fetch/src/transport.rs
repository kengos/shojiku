//! The HTTP seam. A single GET, one hop, no redirect following — redirects are
//! surfaced to the caller as [`TransportError::Redirect`] so that
//! [`crate::ensure`] can re-run the allowlist against every hop instead of
//! letting the client chase an unchecked `Location` on our behalf.
//!
//! The trait exists so the fetch logic is testable without sockets; the ureq
//! implementation below is the only place a connection is opened.

use crate::error::TransportError;
use crate::read::{read_capped, Hashed, MAX_FACE_BYTES};
use shojiku_diagnostics::Echo;
use std::sync::Arc;
use std::time::Duration;

/// Fetches one URL, returning the body bytes and their digest.
///
/// Implementations MUST NOT follow redirects: return
/// [`TransportError::Redirect`] with the `Location` value instead.
pub trait Transport {
    fn get(&self, url: &str, cap: u64) -> Result<Hashed, TransportError>;
}

/// Caps how long a dead host can stall the render.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Real HTTPS via ureq + rustls, roots from the OS trust store.
pub struct HttpTransport {
    agent: ureq::Agent,
}

impl HttpTransport {
    /// Builds the agent. Roots come from `rustls-native-certs` rather than a
    /// bundled root set: the bundled options (`webpki-roots` /
    /// `webpki-root-certs`) are CDLA-Permissive-2.0, which `cargo deny`
    /// rejects, and the OS store is what the user already trusts anyway.
    ///
    /// Note there is no `https_only` here: the scheme, host, and every
    /// redirect hop are gated by [`crate::FetchPolicy`] BEFORE this is called,
    /// which is also what lets the tests drive this type over loopback http.
    pub fn new(timeout: Duration) -> Self {
        let certs: Vec<ureq::tls::Certificate<'static>> = rustls_native_certs::load_native_certs()
            .certs
            .into_iter()
            .map(|c| ureq::tls::Certificate::from_der(c.as_ref()).to_owned())
            .collect();

        let tls = ureq::tls::TlsConfig::builder()
            .provider(ureq::tls::TlsProvider::Rustls)
            // ureq only auto-selects a provider behind its private `_ring`
            // feature; naming it here keeps us on public API.
            .unversioned_rustls_crypto_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .root_certs(ureq::tls::RootCerts::new_with_certs(&certs))
            .build();

        let config = ureq::Agent::config_builder()
            .tls_config(tls)
            // 0 = do not follow; the 3xx response comes back to us so the
            // policy can be re-applied to its Location.
            .max_redirects(0)
            .max_redirects_will_error(false)
            // Status handling is ours: ureq would otherwise turn 4xx/5xx into
            // an opaque Err whose text we'd have to parse to learn the code.
            .http_status_as_error(false)
            .timeout_global(Some(timeout))
            .timeout_connect(Some(CONNECT_TIMEOUT))
            .build();

        Self {
            agent: ureq::Agent::new_with_config(config),
        }
    }
}

impl Default for HttpTransport {
    fn default() -> Self {
        Self::new(Duration::from_secs(60))
    }
}

impl Transport for HttpTransport {
    fn get(&self, url: &str, cap: u64) -> Result<Hashed, TransportError> {
        let mut resp = self
            .agent
            .get(url)
            .call()
            .map_err(|e| TransportError::Io(Echo::from(e.to_string())))?;
        let status = resp.status().as_u16();
        if (300..400).contains(&status) {
            let location = resp
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or(TransportError::RedirectNoLocation)?;
            return Err(TransportError::Redirect(Echo::from(location)));
        }
        if status != 200 {
            return Err(TransportError::Status(status));
        }
        read_capped(&mut resp.body_mut().as_reader(), cap.min(MAX_FACE_BYTES))
    }
}

#[cfg(test)]
mod tests;
