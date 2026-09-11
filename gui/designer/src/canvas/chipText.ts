// What a CHIP on the canvas has to work out for itself, because SVG text has
// no auto-sized background: how wide the label will paint, and — for a label
// that is not ours to shorten — where to cut it.
//
// Two chips already measured this, identically and separately
// (`ContainerMarkVisual`'s kind chip and `OverlayDropShapes`'s drop warning).
// A third would have been the copy that drifts, so this is the one measure now
// and both call sites read it.
//
// The measure is deliberately APPROXIMATE and the chip is deliberately
// forgiving of it: a CJK glyph runs about one em, everything else about 0.55,
// which is close enough for a background that only has to not clip its own
// text. Measuring for real would mean a canvas 2D context or a hidden DOM
// node — a layout read per render, for a rounded rectangle.

/** The format characters (`\p{Cf}`) a legitimate label never needs, and the
 * reason they are dropped rather than rendered: U+202E RIGHT-TO-LEFT OVERRIDE
 * and its neighbours reorder what follows them, so a URL carrying one can be
 * made to READ as a different host than the one the PDF will open. The engine
 * refuses control characters in a link (`\p{Cc}`) and the panel mirrors that
 * exactly — neither set contains `Cf`, so such a URL is stamped `linked` and
 * arrives here. This chip is the one surface that invites a reviewer to trust
 * a destination at a glance, so it strips them BEFORE measuring: after, the
 * width would be charged for characters that paint nothing. */
const FORMAT_CHARS = /\p{Cf}/gu;

/** `text` with the characters no label may carry removed. */
export function chipSafeText(text: string): string {
  return text.replace(FORMAT_CHARS, '');
}

/** Painted width of `text` at `fontPx`, plus `pad` on each side. */
export function chipWidth(text: string, fontPx: number, pad: number): number {
  let width = 0;
  for (const ch of text) {
    width += ch.charCodeAt(0) >= 0x2e80 ? fontPx : fontPx * 0.55;
  }
  return Math.ceil(width) + pad * 2;
}

/** `text` shortened until its chip fits `maxWidth`, with a single-character
 * ellipsis standing for what was dropped. Returns `text` untouched when it
 * already fits.
 *
 * This exists for the ONE chip whose text is not ours: a hyperlink's
 * destination is AUTHORED, and its authored length is bounded by nothing — the
 * engine's 2048-byte cap is applied to the RESOLVED value, so
 * `https://x.test/{a-very-long-key-name}` reaches here at its authored length
 * however short it resolves. A chip as wide as that would paint off the page. The cut is by CHARACTER rather
 * than by byte or by code unit — `for…of` walks code POINTS, so an astral
 * character is never split into halves that render as replacement glyphs. */
export function fitChipText(text: string, fontPx: number, pad: number, maxWidth: number): string {
  if (chipWidth(text, fontPx, pad) <= maxWidth) {
    return text;
  }
  // Sliced BEFORE the loop, and this is not a micro-optimisation: the loop
  // below re-measures its whole prefix each step, so it is quadratic in the
  // input, and the input is an authored URL. At the engine's 2048-byte cap one
  // call cost 31 ms — two dropped frames on every re-render the hover survives.
  // No glyph measures less than `fontPx * 0.55`, so nothing past this many
  // characters can survive the cut whatever they are; slicing here changes no
  // output and takes that 31 ms to 0.03.
  const ceiling = Math.ceil(maxWidth / (fontPx * 0.55)) + 1;
  const chars = [...text].slice(0, ceiling);
  // Shrink from the end, never below the ellipsis alone: a maxWidth too small
  // for even that is a degenerate page, and returning '…' paints a mark the
  // reader can at least see is truncated rather than nothing at all.
  for (let keep = chars.length; keep > 0; keep -= 1) {
    const candidate = `${chars.slice(0, keep).join('')}…`;
    if (chipWidth(candidate, fontPx, pad) <= maxWidth) {
      return candidate;
    }
  }
  return '…';
}
