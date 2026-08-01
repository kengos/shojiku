// The read-only indexes several surfaces share, derived from the document text:
// the outline the layer tree and breadcrumb walk, the named-style usage index
// the format toolbar reads for its impact scope, and the engine-default floor
// the cascade mirror resolves an unset inherited key against.

import { useMemo } from 'react';
import { buildStyleFloor } from '../panel/engineDefaults';
import { buildStyleUsage, type StyleUsage } from '../styles/usage';
import { buildTree, type TreeView } from '../tree/model';

export interface DocDerived {
  /** The document outline — built from the DOCUMENT, never the box index, so it
   * stays correct when a render fails. */
  readonly treeView: TreeView | null;
  /** Name → reference paths, for a named style's impact scope. */
  readonly styleUsage: StyleUsage | null;
  /** The static engine defaults plus the locale's default face (when the host
   * supplied it), so an unset inherited key reads as its real default. */
  readonly styleFloor: Readonly<Record<string, string>>;
}

export function useDocDerived(text: string, defaultFontFamily: string | undefined): DocDerived {
  const treeView = useMemo(() => buildTree(text), [text]);
  const styleUsage = useMemo(() => buildStyleUsage(text), [text]);
  const styleFloor = useMemo(() => buildStyleFloor(defaultFontFamily), [defaultFontFamily]);
  return { treeView, styleUsage, styleFloor };
}
