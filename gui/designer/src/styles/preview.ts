// Pure model for the gdoc-style style-picker preview: it turns one registry
// entry's editable style props (the controlled `StyleEntry.style` projection —
// keyed by `STYLE_FIELDS`, empty string = unset) into the chrome CSS that
// renders the style's NAME in an approximation of itself. This is a chrome
// approximation, NOT an engine render — it never measures or lays out; it only
// helps a picker row read as its style so choosing is visual, not name-guessing.
//
// Security posture: every value is authored template text (a loaded/pasted
// template is untrusted). Props are emitted as a React style OBJECT (individual
// CSSOM property assignments — a malformed/hostile value is ignored by the
// browser, never a CSS-string breakout), never string-composed CSS and never
// `dangerouslySetInnerHTML`. `fontSize` is parsed to a bounded NUMBER so a
// hostile length string can never reach the DOM verbatim.

import type { CSSProperties } from 'react';

/** The chrome a preview chip sits on: a FIXED paper tint (the document is white
 * paper), so an authored color/background reads truthfully in both themes
 * instead of against the surrounding light/dark chrome. Shared by every surface
 * that previews a style — the toolbar picker, the capture modal, the registry
 * list — so they cannot drift apart; padding and truncation stay per-site. */
export const PREVIEW_CHIP = 'rounded-sm bg-[#fcfcfa] text-[#1a1a1a]';

/** Display-size clamp (px) for a picker row: a heading must not tower over the
 * menu and a tiny caption must stay legible. Authored `fontSize` is pt-ish
 * (bare pt / `pt` / `px`); other units and garbage drop to the inherited row
 * size rather than reach the DOM. */
const MIN_PREVIEW_PX = 9;
const MAX_PREVIEW_PX = 24;

/** Parse an authored `fontSize` into a bounded preview px, or `undefined` to
 * inherit the row size. Accepts a finite positive number optionally suffixed
 * `pt`/`px`; anything relative (`em`/`rem`/`%`) or non-numeric is dropped so no
 * unbounded or hostile string is ever assigned. */
function previewFontSizePx(raw: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(pt|px)?$/.exec(raw.trim());
  if (match === null) {
    return undefined;
  }
  // The regex admits only a finite non-negative decimal; `0`/`0.0` is the only
  // way `value <= 0` fires (a real zero-size style is not a preview).
  const value = Number(match[1]);
  if (value <= 0) {
    return undefined;
  }
  return Math.min(Math.max(value, MIN_PREVIEW_PX), MAX_PREVIEW_PX);
}

/** The chrome CSS that renders a style's name in an approximation of itself.
 * Only props the style actually sets are emitted (unset keys inherit the row),
 * and `fontWeight` follows the enum (`bold` only — any other value reads as the
 * default weight). `color`/`backgroundColor`/`fontFamily` pass through as object
 * props: the CSSOM ignores an invalid value, so an untrusted string cannot
 * break out of the declaration. */
export function stylePreview(style: Readonly<Record<string, string>>): CSSProperties {
  const css: CSSProperties = {};
  const size = previewFontSizePx(style.fontSize ?? '');
  if (size !== undefined) {
    css.fontSize = `${size}px`;
  }
  if (style.fontFamily) {
    css.fontFamily = style.fontFamily;
  }
  if (style.fontWeight === 'bold') {
    css.fontWeight = 'bold';
  }
  if (style.fontStyle === 'italic') {
    css.fontStyle = 'italic';
  }
  if (style.textAlign === 'left' || style.textAlign === 'center' || style.textAlign === 'right') {
    css.textAlign = style.textAlign;
  }
  if (style.color) {
    css.color = style.color;
  }
  if (style.backgroundColor) {
    css.backgroundColor = style.backgroundColor;
  }
  return css;
}
