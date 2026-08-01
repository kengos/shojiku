//! Which URLs the host is willing to fetch a pinned face from. This is
//! defense-in-depth, NOT the integrity control — the manifest `sha256` is what
//! guarantees the bytes. The policy exists so a hostile manifest cannot aim the
//! host at arbitrary network locations (an SSRF probe still has a side effect
//! even when its bytes are rejected), so it is checked on EVERY redirect hop,
//! not just the declared URL.

use std::net::{Ipv4Addr, Ipv6Addr};
use ureq::http::Uri;

/// Fetch sources trusted without the user opting in. Deliberately short: the
/// upstreams the shipped tooling actually generates manifests for.
pub const DEFAULT_ALLOWED_HOSTS: &[&str] = &[
    "fonts.gstatic.com",
    "github.com",
    // github.com release-asset downloads redirect here.
    "objects.githubusercontent.com",
    "raw.githubusercontent.com",
];

/// The host allowlist a fetch is checked against.
#[derive(Debug, Clone)]
pub struct FetchPolicy {
    hosts: Vec<String>,
}

impl Default for FetchPolicy {
    fn default() -> Self {
        Self::with_extra_hosts::<&str>(&[])
    }
}

impl FetchPolicy {
    /// The default allowlist plus caller-supplied hosts (the CLI's
    /// `--font-fetch-allow`, e.g. an internal mirror). Hosts are matched
    /// case-insensitively.
    pub fn with_extra_hosts<S: AsRef<str>>(extra: &[S]) -> Self {
        let mut hosts: Vec<String> = DEFAULT_ALLOWED_HOSTS
            .iter()
            .map(|h| (*h).to_string())
            .collect();
        hosts.extend(extra.iter().map(|h| h.as_ref().to_lowercase()));
        Self { hosts }
    }

    /// Accepts `url` for fetching, or explains why not. The reason is written
    /// for a user reading it on stderr.
    pub fn check(&self, url: &str) -> Result<(), String> {
        let uri: Uri = url.parse().map_err(|_| "not a valid URL".to_string())?;
        match uri.scheme_str() {
            Some("https") => {}
            Some(other) => return Err(format!("scheme `{other}` is not https")),
            None => return Err("no scheme (https required)".to_string()),
        }
        let authority = uri.authority().ok_or("no host")?;
        // `Uri::host` strips userinfo, so a `user@host` URL would otherwise be
        // checked against the wrong half — reject the form outright rather
        // than trying to interpret it.
        if authority.as_str().contains('@') {
            return Err("URL carries userinfo (`user@host`)".to_string());
        }
        let host = uri.host().ok_or("no host")?.to_lowercase();
        if is_ip_literal(&host) {
            return Err("host is an IP literal, not a name".to_string());
        }
        if self.allows(&host) {
            Ok(())
        } else {
            Err(format!("host `{host}` is not in the allowlist"))
        }
    }

    /// Exact host match, or a subdomain of an allowlisted host. The `.`
    /// boundary is what makes this safe: without it `fonts.gstatic.com` would
    /// also match `evil-fonts.gstatic.com.attacker.io`.
    fn allows(&self, host: &str) -> bool {
        self.hosts
            .iter()
            .any(|a| host == a || host.ends_with(&format!(".{a}")))
    }
}

/// True when `host` is a bare address rather than a name. IPv6 literals arrive
/// bracketed (`[::1]`) from the URL authority.
fn is_ip_literal(host: &str) -> bool {
    let unbracketed = host.strip_prefix('[').and_then(|h| h.strip_suffix(']'));
    match unbracketed {
        Some(inner) => inner.parse::<Ipv6Addr>().is_ok(),
        None => host.parse::<Ipv4Addr>().is_ok(),
    }
}

#[cfg(test)]
mod tests;
