// The engine's own default style values, mirrored GUI-side so the document
// defaults editor can SEED every field with the real value it would render at
// ("seed the display, author only what changed") and the cascade mirror can floor an unset
// inherited key to the same value (its default origin). These are the engine
// defaults documented in docs/engine/style.md and pinned to the real engine by a
// wasm-integration seed-truth test (a document with these six keys spelled
// explicitly renders pixel-identical to one with no `defaults.style`), so the
// literal here can never silently drift from the engine.
//
// `fontFamily` is DELIBERATELY absent: the engine's default face is the locale
// pack's `fonts.default`, not a fixed id, so it is host-derived and threaded in
// as `defaultFontFamily` (see `buildStyleFloor`); a hardcoded family id here
// would go stale per locale. `backgroundColor` is absent because it does not
// inherit — a cascade root / floor only makes sense for inherited properties.

/** The engine's default values for the STATIC inherited style keys (every
 * inherited `STYLE_FIELDS` key except the host-derived `fontFamily`), as the
 * display strings the fields render. Keyed by the wire style key. */
export const ENGINE_STYLE_DEFAULTS: Readonly<Record<string, string>> = {
  fontSize: '10',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'left',
  lineHeight: '1.4',
  color: '#000000',
};

/** The engine-default floor the cascade mirror falls unset inherited keys to:
 * the static defaults plus the host-derived `fontFamily` when the host supplied
 * it. Built once by the Designer and threaded to the format toolbar + the
 * property panel. Absent `defaultFontFamily` → the floor simply omits
 * `fontFamily`, so an unset family resolves to `unset` (no source to show),
 * exactly as today. An empty host family is treated as absent (a floor entry is
 * always a REAL value, so the cascade mirror can trust a present key). */
export function buildStyleFloor(defaultFontFamily?: string): Readonly<Record<string, string>> {
  return defaultFontFamily === undefined || defaultFontFamily === ''
    ? ENGINE_STYLE_DEFAULTS
    : { ...ENGINE_STYLE_DEFAULTS, fontFamily: defaultFontFamily };
}
