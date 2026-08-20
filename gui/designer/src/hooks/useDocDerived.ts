// The read-only indexes several surfaces share, derived from the document text:
// the outline the layer tree and breadcrumb walk, the two registry usage
// indexes (named styles for the format toolbar's impact scope, named formats
// for the same on the registry section), the engine-default floor the cascade
// mirror resolves an unset inherited key against, and the ENGINE's format
// catalog.
//
// The catalog is the one member that is not a pure derivation — it is an engine
// answer, so it arrives asynchronously and is `null` until it does (and
// permanently on a transport that cannot answer). It lives here anyway because
// it is keyed on the document and consumed by the same surfaces.

import { useMemo } from 'react';
import type { EngineTransport } from '../engine/transport';
import { formatCatalogKey } from '../formats/catalogKey';
import { buildFormatUsage, type FormatUsage } from '../formats/usage';
import { buildStyleFloor } from '../panel/engineDefaults';
import { buildStyleUsage, type StyleUsage } from '../styles/usage';
import { buildTree, type TreeView } from '../tree/model';
import { type FormatCatalogState, useFormatCatalog } from './useFormatCatalog';

export interface DocDerived {
  /** The document outline — built from the DOCUMENT, never the box index, so it
   * stays correct when a render fails. */
  readonly treeView: TreeView | null;
  /** Name → reference paths, for a named style's impact scope. */
  readonly styleUsage: StyleUsage | null;
  /** Name → reference paths for a named FORMAT: the registry section's impact
   * scope, and what a rename/delete rewrites. */
  readonly formatUsage: FormatUsage | null;
  /** The engine's format catalog for this document, plus the pattern probe. */
  readonly formats: FormatCatalogState;
  /** The static engine defaults plus the locale's default face (when the host
   * supplied it), so an unset inherited key reads as its real default. */
  readonly styleFloor: Readonly<Record<string, string>>;
}

export function useDocDerived(
  text: string,
  defaultFontFamily: string | undefined,
  transport: EngineTransport,
): DocDerived {
  const treeView = useMemo(() => buildTree(text), [text]);
  const styleUsage = useMemo(() => buildStyleUsage(text), [text]);
  const formatUsage = useMemo(() => buildFormatUsage(text), [text]);
  const styleFloor = useMemo(() => buildStyleFloor(defaultFontFamily), [defaultFontFamily]);
  // Keyed on the catalog-relevant SLICE, so a body keystroke costs no engine
  // call while a format-default edit costs exactly one.
  const key = useMemo(() => formatCatalogKey(text), [text]);
  const formats = useFormatCatalog({ transport, text, key });
  return { treeView, styleUsage, formatUsage, styleFloor, formats };
}
