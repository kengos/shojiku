// What the engine accepts as a font pack id, mirrored so the app never mints
// one the engine will refuse.
//
// A pack id is a directory name under a font search dir AND a URL segment we
// fetch through, and the engine hardened it into a closed rule: non-empty,
// at most 64 bytes, letters/digits/`-`/`_` only. The rule's home is
// `engine/formatter/src/lang/fonts/pack_id.rs` (`valid_pack_id`), where a
// `uses:` entry that breaks it fails the LOCALE PACK's parse — so a bad id
// does not cost one font, it costs the whole pack. That is why the check
// sits in front of the picker (`isUsableFamily`) rather than at the write.
//
// This is deliberately STRICTER than `isSafeAssetName`, which also admits
// `.` and bounds no length: that guard is about URL segments, and a name can
// be a safe URL segment while still being an unusable pack id.

/** Longest pack id the engine accepts (`MAX_PACK_ID` in the engine). */
export const MAX_PACK_ID = 64;

/** Prefix for every generated pack + face id. Face ids are a flat global
 * namespace shared with the bundled packs, so a picked `noto-sans` must not
 * collide with the bundled one — the prefix keeps the two spaces disjoint. */
export const PACK_ID_PREFIX = 'gf-';

const PACK_ID = /^[A-Za-z0-9_-]+$/;

/** Whether the engine would accept `id` as a font pack id. */
export function isValidPackId(id: string): boolean {
  return id.length <= MAX_PACK_ID && PACK_ID.test(id);
}

/** The pack id minted for a catalog family id. Kept here, beside the rule it
 * has to satisfy, so the two cannot drift apart. */
export function packIdForFamilyId(familyId: string): string {
  return `${PACK_ID_PREFIX}${familyId}`;
}
