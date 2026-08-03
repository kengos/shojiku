//! What a font pack id may be. A pack id is the one part of the locale
//! `fonts:` wire that becomes a filesystem NAME (and a URL segment on
//! hosts that fetch packs), so its charset is a wire rule rather than a
//! resolver detail — the resolvers' own re-check lives beside them, in
//! `lang/packs/confine.rs`.

use serde::{Deserialize, Deserializer};
use shojiku_diagnostics::Echo;

/// Longest accepted font pack id. A pack id becomes a directory NAME under
/// a font search dir, so it is bounded like the sibling locale id.
pub const MAX_PACK_ID: usize = 64;

/// Is `id` usable as a font pack id?
///
/// A pack id is a **single path segment** — the resolver reads
/// `<font-dir>/<id>/manifest.yml` — and hosts compose it into URLs
/// (a WASM host fetches a declared pack by id). So it takes the same
/// closed charset as a locale id: letters, digits, `-`, `_`, non-empty
/// and bounded. Anything else could name a directory outside the search
/// dir (`..`, an absolute path) or a URL path outside the pack root.
pub fn valid_pack_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_PACK_ID
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Deserializes `fonts.uses`, rejecting any entry that is not a valid pack
/// id. A locale pack is untrusted input, so a hostile id is a located
/// PARSE error rather than a path handed to the resolvers — which is also
/// what keeps `LangPack::font_pack_ids()` safe for the hosts that build a
/// fetch URL out of it.
pub(super) fn deserialize_uses<'de, D: Deserializer<'de>>(de: D) -> Result<Vec<String>, D::Error> {
    let uses = Vec::<String>::deserialize(de)?;
    if let Some(bad) = uses.iter().find(|id| !valid_pack_id(id)) {
        return Err(serde::de::Error::custom(format!(
            "font pack id `{}` is not a valid pack id \
             (allowed: letters, digits, `-`, `_`; 1-{MAX_PACK_ID} characters)",
            Echo::clipped_to(bad, MAX_PACK_ID)
        )));
    }
    Ok(uses)
}
