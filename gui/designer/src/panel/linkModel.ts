// The READ side of `link: { url }` — what the panel shows for a hyperlink, and
// whether a typed URL is one the engine would keep.
//
// The wire carries `link` on THREE carriers (`engine/core/src/template`):
// `TextItem`, `ImageItem` and `Span`. The first two are item types the property
// panel selects, so they are what [`LINK_TYPES`] holds; a span's link belongs to
// the rich-text editor and has no surface yet.
//
// Reading degrades rather than throws, like every other panel model: a hostile
// `link` (a scalar, a sequence, an explicit null) reads as an empty URL. Such a
// document does not render anyway — `Link.url` is required, so `link: {}` is a
// parse error, not a link the panel is hiding.
//
// The refusal predicate mirrors `engine/layout/src/engine/link.rs::check_link_url`
// and `linkModel.drift.test.ts` reads that file to keep the two from drifting.

import type { ReadFn } from '@shojiku/designer-core';
import { readItem } from '../text/declModel';
import { record } from './itemView';

/** The item types whose wire struct carries a `link:` key. `qr_code` and
 * `char_grid` are separate structs and take none, so offering them the field
 * would author a `deny_unknown_fields` parse error. */
export const LINK_TYPES: ReadonlySet<string> = new Set(['text', 'image']);

/** The engine capability an older build lacks — it rejects the key at PARSE,
 * so the field must not be offered hopefully. */
export const LINK_CAPABILITY = 'link.url';

/** The URL the item at `path` links to, or `''` for no link. */
export function readLinkUrl(read: ReadFn, path: string): string {
  const url = record(readItem(read, path)?.link)?.url;
  return typeof url === 'string' ? url : '';
}

/** The schemes layout emits a PDF `/URI` action for. A copy of the engine's
 * allowlist; the drift guard pins it to `link.rs`. */
export const LINK_SCHEMES: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:'];

/** `MAX_LINK_URL` — BYTES, not characters. A multi-byte URL is exactly where
 * `String.length` and the engine's `str::len` disagree. */
export const MAX_LINK_URL_BYTES = 2048;

/** Why a typed URL would be dropped, or `null` for one the panel will author. */
export type LinkProblem = 'scheme' | 'tooLong';

/** ASCII-only lowercasing, matching Rust's `eq_ignore_ascii_case`. Not
 * `String.toLowerCase()`, which is Unicode-aware and can change a string's
 * LENGTH (`U+0130` lowercases to two code points), so a fixed-width prefix
 * comparison against it would not answer the same question the engine asks. */
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/** Whether the typed URL interpolates. The engine gates the RESOLVED value —
 * `resolve_link` runs `resolve_content` first — and all TEN of the bundled
 * examples that author a link interpolate it, none of them carrying a scheme
 * (`{web.invoice_url}`). So an interpolating URL is unknowable here and is
 * always passed through; the engine's own diagnostic reports it if the
 * resolved value turns out to be bad. (`grep -r 'link: { url:' examples/`
 * returns one literal `https://example.com` on top of those ten — it is a
 * sample inside the showcase's CODE PANEL, not an authored link.) */
function interpolates(url: string): boolean {
  return url.includes('{');
}

/** The panel's mirror of `check_link_url`. An empty (or whitespace-only) URL is
 * the CLEAR path rather than a problem, so it reports `null` too. */
export function linkUrlProblem(url: string): LinkProblem | null {
  if (interpolates(url)) {
    return null;
  }
  const trimmed = url.trim();
  if (trimmed === '') {
    return null;
  }
  // UTF-8 never spends fewer than one byte per UTF-16 code unit, so a string
  // longer than the cap in CHARACTERS is over it in bytes too. Checking that
  // first means a megabyte pasted into the field is refused without encoding a
  // megabyte to find out.
  if (trimmed.length > MAX_LINK_URL_BYTES) {
    return 'tooLong';
  }
  if (new TextEncoder().encode(trimmed).length > MAX_LINK_URL_BYTES) {
    return 'tooLong';
  }
  // `char::is_control` is the Unicode Cc category, which `\p{Cc}` is exactly.
  if (/\p{Cc}/u.test(trimmed)) {
    return 'scheme';
  }
  const lower = asciiLower(trimmed);
  return LINK_SCHEMES.some((scheme) => lower.startsWith(scheme)) ? null : 'scheme';
}

/** Where the caret lands after a splice, and the text it lands in. */
export interface Splice {
  readonly value: string;
  readonly caret: number;
}

/** Replace `[start, end)` of `value` with `wire`. The bounds come straight off
 * an `HTMLInputElement`, which types them `number | null` (null for the input
 * types that support no selection) and can report a caret past the value, so
 * both are normalised here rather than at the call site — one place to test. */
export function spliceAt(
  value: string,
  start: number | null,
  end: number | null,
  wire: string,
): Splice {
  const lo = Math.max(0, Math.min(start ?? 0, value.length));
  const hi = Math.max(lo, Math.min(end ?? lo, value.length));
  return { value: value.slice(0, lo) + wire + value.slice(hi), caret: lo + wire.length };
}
