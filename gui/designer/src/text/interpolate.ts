// `{key}` / `{key:format}` interpolation parsing over static text — a pure TS
// mirror of the engine's segment parser (`engine/core/src/interpolate.rs`):
// `{{` escapes a literal `{`, keys are `[A-Za-z0-9_.]`, format names
// `[A-Za-z0-9_-]`, and malformed expressions (unclosed braces, invalid
// characters, empty key) stay literal text — the engine degrades visibly and
// so must the GUI's reading of it. Single linear index scan (no RegExp over
// document text, no backtracking); the one deliberate deviation is
// `MAX_TEXT_EXPRS`, a display-side bound the engine does not need — beyond it
// further expressions read as literals, so a hostile text cannot mint
// unbounded binding refs. ONE scan feeds two projections: `parseSegments`
// (the unescaped reading the usage walk consumes) and `parseRawSegments`
// (segments carrying their exact wire slices, so the chip editor can put the
// text back together byte-identically — concatenating `raw` reproduces the
// input by construction).

/** Expressions extracted per text node before the rest reads as literal. */
export const MAX_TEXT_EXPRS = 64;

export type Segment =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'expr'; readonly key: string; readonly format: string | null };

/** A segment paired with its exact wire slice: literal `raw` keeps escapes
 * (`{{` stays `{{`) while `text` is the unescaped reading; an expression's
 * `raw` is the full `{key}` / `{key:format}` slice. */
export type RawSegment =
  | { readonly kind: 'literal'; readonly raw: string; readonly text: string }
  | {
      readonly kind: 'expr';
      readonly raw: string;
      readonly key: string;
      readonly format: string | null;
    };

function isKeyChar(c: string): boolean {
  return (
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '_' ||
    c === '.'
  );
}

function isFormatChar(c: string): boolean {
  return (
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '_' ||
    c === '-'
  );
}

/** Split `text` into literal and expression segments, each carrying its wire
 * slice (the engine's rules; see `parseSegments` for the unescaped view).
 * All specials are ASCII, so scanning by code unit is safe — non-ASCII text
 * flows into literals untouched. */
export function parseRawSegments(text: string): readonly RawSegment[] {
  const segments: RawSegment[] = [];
  let raw = '';
  let literal = '';
  let exprs = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c !== '{') {
      raw += c;
      literal += c;
      i += 1;
      continue;
    }
    if (text[i + 1] === '{') {
      raw += '{{';
      literal += '{';
      i += 2;
      continue;
    }
    // Try to read `key[:format]}` from past the brace.
    let j = i + 1;
    let key = '';
    let format = '';
    let inFormat = false;
    let closed = false;
    while (j < text.length) {
      const c2 = text[j];
      j += 1;
      if (c2 === '}') {
        closed = true;
        break;
      }
      if (c2 === ':' && !inFormat) {
        inFormat = true;
        continue;
      }
      if (!inFormat && isKeyChar(c2)) {
        key += c2;
        continue;
      }
      if (inFormat && isFormatChar(c2)) {
        format += c2;
        continue;
      }
      break;
    }
    const valid = closed && key !== '' && (!inFormat || format !== '') && exprs < MAX_TEXT_EXPRS;
    if (valid) {
      // `raw` and `literal` fill in lockstep (every append writes both), so
      // one emptiness check flushes them together.
      if (literal !== '') {
        segments.push({ kind: 'literal', raw, text: literal });
        raw = '';
        literal = '';
      }
      segments.push({
        kind: 'expr',
        raw: text.slice(i, j),
        key,
        format: inFormat ? format : null,
      });
      exprs += 1;
    } else {
      // The brace plus everything consumed (including the breaking character
      // or the `}` of an invalid expression) stays literal, as in the engine.
      raw += text.slice(i, j);
      literal += text.slice(i, j);
    }
    i = j;
  }
  if (literal !== '') {
    segments.push({ kind: 'literal', raw, text: literal });
  }
  return segments;
}

/** Split `text` into literal and expression segments (the engine's rules),
 * literals unescaped (`{{` reads as `{`). */
export function parseSegments(text: string): readonly Segment[] {
  return parseRawSegments(text).map((segment) =>
    segment.kind === 'literal'
      ? { kind: 'literal', text: segment.text }
      : { kind: 'expr', key: segment.key, format: segment.format },
  );
}

/** The distinct interpolation keys of `text`, in first-appearance order. */
export function interpolationKeys(text: string): readonly string[] {
  const seen = new Set<string>();
  for (const segment of parseSegments(text)) {
    if (segment.kind === 'expr') {
      seen.add(segment.key);
    }
  }
  return [...seen];
}
