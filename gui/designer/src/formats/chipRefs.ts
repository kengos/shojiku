// Format references written INSIDE interpolated text — `{key:closing}` — which
// the engine resolves through the very same dispatch a `format:` key does
// (`layout/engine/text/resolve.rs`: a segment's format reaches
// `resolve_binding` exactly as `Binding.format` does, and an inline `:format`
// overrides a declaration's). A rename that rewrote only the `format:` keys
// would half-apply and leave these naming an entry that no longer exists.
//
// A chip reference is rewritten by restating the WHOLE string, so the rewrite
// is byte-exact by construction: every segment the rename does not touch is
// re-emitted as its own wire slice (`RawSegment.raw`), which concatenates back
// to the input.

import { MAX_TEXT_EXPRS, parseRawSegments } from '../text/interpolate';

/** One `{key:format}` expression of a text value: the interpolation NAME (a
 * declared name, or the params key itself) beside the format it picks. */
export interface ChipFormat {
  readonly name: string;
  readonly format: string;
}

/** The `{key:format}` expressions of `text`, plus whether the scan may be
 * INCOMPLETE: past `MAX_TEXT_EXPRS` the GUI's parser reads further expressions
 * as literals while the engine keeps interpolating them, so a saturated text
 * may hold references this scan cannot see — the caller must treat the whole
 * index as untrustworthy rather than rewrite from it.
 *
 * A string with no `{` at all short-circuits: the walk runs this over EVERY
 * string in the document, and the overwhelming majority carry no expression. */
export function chipFormats(text: string): {
  readonly formats: readonly ChipFormat[];
  readonly capped: boolean;
} {
  if (!text.includes('{')) {
    return { formats: [], capped: false };
  }
  const formats: ChipFormat[] = [];
  let exprs = 0;
  for (const segment of parseRawSegments(text)) {
    if (segment.kind !== 'expr') {
      continue;
    }
    exprs += 1;
    if (segment.format !== null) {
      formats.push({ name: segment.key, format: segment.format });
    }
  }
  return { formats, capped: exprs >= MAX_TEXT_EXPRS };
}

/** Rewrite every `{key:oldName}` in `text`: to `{key:newName}` for a rename, or
 * to a bare `{key}` when `newName` is null (a delete strips the picked format
 * and leaves the binding rendering the field's own default, exactly as clearing
 * a `format:` key does). Every other byte is re-emitted verbatim. */
export function rewriteChipFormat(text: string, oldName: string, newName: string | null): string {
  let out = '';
  for (const segment of parseRawSegments(text)) {
    if (segment.kind === 'expr' && segment.format === oldName) {
      out += newName === null ? `{${segment.key}}` : `{${segment.key}:${newName}}`;
    } else {
      out += segment.raw;
    }
  }
  return out;
}
