// Header/footer band rules: which kinds only make sense inside a band, and
// what a band insert has to carry that a flow-body insert does not. Band
// children are coordinate-placed (they resolve against the page margin box),
// which is what makes their placement different from a flow body's.
// Framework-free.

import type { SnippetValue } from '@shojiku/designer-core';
import type { InsertKind } from './insertMenu';

/** Which items only make sense inside a header/footer band. */
export function requiresBand(kind: InsertKind): boolean {
  return kind === 'pageNumber';
}

/** Where a freshly inserted band item goes. A header item sits at the top of
 * the margin box; a footer item sits just inside its bottom edge — the reader
 * should find it where bands actually print, not at y 0 on page one.
 *
 * `marginBoxHeight` comes from pixel-derived render geometry, so it is floored
 * before use (a ceil-inflated bound would place the item past the page edge,
 * where band items render silently). */
export function bandInsertY(band: 'header' | 'footer', marginBoxHeight: number): number {
  if (band === 'header' || !Number.isFinite(marginBoxHeight)) {
    return 0;
  }
  return Math.max(0, Math.floor(marginBoxHeight) - 32);
}

/** The band-placed form of a snippet: the same item, plus the coordinates a
 * band requires. A body insert keeps its box-less flow form. */
export function bandPlaced(snippet: SnippetValue, y: number): SnippetValue {
  const item = snippet as Record<string, unknown>;
  const box = (item.box ?? {}) as Record<string, unknown>;
  return { ...item, box: { w: '100%', h: 16, ...box, x: 0, y } } as SnippetValue;
}
