// Where a fresh insert goes once its target is resolved: the ONE door every
// insert SURFACE that can land in a header or footer passes through (the
// element and block inserts, the container picker, the field dialog, the image
// import), so none of them can forget that a band's direct children are
// coordinate-placed. Not a door for re-authoring an EXISTING item in place:
// `insert/wrap.ts` wraps a band child that already carries its coordinates.
// A body or container target keeps the snippet exactly as authored.

import type { ReadFn, SnippetValue } from '@shojiku/designer-core';
import type { LastGoodPreview } from '../preview/reducer';
import { bandBoxHeightPt } from './bandGeometry';
import { bandInsertY, bandPlaced } from './bandPlacement';
import { insertTargetBand } from './flowPlacement';

/** The snippet as it should be written into the resolved target at `path`:
 * band-placed (coordinates against the page margin box, a footer item
 * bottom-aligned by its own numeric `box.h`) when the target is a band
 * directly, unchanged otherwise. */
export function placeForTarget(
  read: ReadFn,
  preview: LastGoodPreview | null,
  path: string,
  snippet: SnippetValue,
): SnippetValue {
  const band = insertTargetBand(read, path);
  if (band === null) {
    return snippet;
  }
  const box = (snippet as { readonly box?: unknown }).box;
  const height =
    typeof box === 'object' && box !== null ? (box as Record<string, unknown>).h : undefined;
  return bandPlaced(snippet, bandInsertY(band, bandBoxHeightPt(preview, read), height));
}
