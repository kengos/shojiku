//! When a deprecated thing goes: the release that deprecated it and the one
//! that removes it, for a wire form (`deprecated_syntax`) and for a
//! diagnostic code alike — readable by a consumer, and checked by the
//! engine's own tests so a removal cannot be forgotten once its release
//! arrives (`docs/architecture.md` § Deprecation).

/// The deprecation window of one wire form or diagnostic code.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Deprecation {
    /// The release that deprecated it.
    pub since: &'static str,
    /// The release that removes it.
    pub removed_in: &'static str,
}

impl Deprecation {
    /// Whether `version` has reached [`Self::removed_in`], comparing the
    /// `major.minor.patch` core only — so a pre-release of the removing
    /// release (`0.4.0-rc.1`) already counts, since it ships without the
    /// removed thing too. A component that is not a number reads as 0, so
    /// a table spells its versions as [`Self::is_release`] requires.
    #[must_use]
    pub fn is_due_at(&self, version: &str) -> bool {
        release(version) >= release(self.removed_in)
    }

    /// Whether both versions are plain `major.minor.patch` releases — what a
    /// deprecation table must write, since a typo like `4.0` for `0.4.0`
    /// would otherwise move the removal silently.
    #[must_use]
    pub fn is_release(&self) -> bool {
        [self.since, self.removed_in].iter().all(|v| {
            let parts: Vec<&str> = v.split('.').collect();
            parts.len() == 3
                && parts
                    .iter()
                    .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
        })
    }
}

fn release(version: &str) -> [u64; 3] {
    let mut out = [0; 3];
    for (slot, part) in out.iter_mut().zip(version.split(['.', '-', '+'])) {
        *slot = part.parse().unwrap_or(0);
    }
    out
}

#[cfg(test)]
mod tests;
