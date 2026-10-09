// The palette area's UNTRUSTED-INPUT caps, in one place: definitions and
// template text are host-supplied in hosted mode, so every walk is depth- and
// count-bounded and every string that reaches the DOM is length-bounded. A
// no-import leaf shared by the display narrowing, both walks and the
// definitions view — keeping them together is what makes the area's posture
// readable without opening four files.

/** Groups the palette will display, and leaf fields per group. */
export const MAX_PALETTE_GROUPS = 256;
export const MAX_PALETTE_FIELDS = 256;

/** Longest display string any palette-sourced value may put in the DOM. */
export const MAX_TEXT_CHARS = 120;

/** Cap on the `enum` members an editor offers as choices. */
export const MAX_ENUM_OPTIONS = 64;

/** Cap on the declared display variants (`displayFormats`) a format picker
 * reads for one field. Past it the picker errs toward OFFERING LESS: an entry
 * beyond the cap is not offered, and a locale variant it names is dropped as if
 * undeclared — never a pick the engine would refuse. */
export const MAX_DECLARED_FORMATS = 64;

/** Nesting cap for the schema and template walks — bounds hostile deep
 * nesting and any cyclic structure YAML anchors could express through the
 * materialized view. */
export const MAX_WALK_DEPTH = 32;
