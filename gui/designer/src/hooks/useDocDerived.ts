// The read-only indexes several surfaces share, derived from the document text:
// the outline the layer tree and breadcrumb walk, the two registry usage
// indexes (named styles for the format toolbar's impact scope, named formats
// for the same on the registry section), the engine-default floor the cascade
// mirror resolves an unset inherited key against, and the two ENGINE answers —
// the format catalog and the locale facts.
//
// Those two are the members that are not pure derivations — they are engine
// answers, so they arrive asynchronously and are `null` until they do (and
// permanently on a transport that cannot answer). They live here anyway
// because they are keyed on the document and consumed by the same surfaces.

import { useMemo } from 'react';
import type { EngineTransport } from '../engine/transport';
import type { LocaleFacts } from '../engine/types';
import { formatCatalogKey } from '../formats/catalogKey';
import { buildFormatUsage, type FormatUsage } from '../formats/usage';
import type { PaletteGroup } from '../palette/model';
import { buildStyleFloor } from '../panel/engineDefaults';
import type { DesignerProps } from '../props';
import { buildStyleUsage, type StyleUsage } from '../styles/usage';
import { buildTree, type TreeView } from '../tree/model';
import { type FormatCatalogState, useFormatCatalog } from './useFormatCatalog';
import { useLocaleFacts } from './useLocaleFacts';

export interface DocDerivedInput {
  readonly text: string;
  readonly defaultFontFamily: string | undefined;
  readonly transport: EngineTransport;
  readonly paletteGroups: readonly PaletteGroup[] | null;
  /** The ENGINE-resolvable tag the document's `defaults.locale` formats
   * through — already mapped, so this file never learns the chrome registry. */
  readonly localeTag: string;
  /** Where a locale pack's text comes from, injected by the host. */
  readonly localePacks: DesignerProps['localePacks'];
}

export interface DocDerived {
  /** The document outline — built from the DOCUMENT, never the box index, so it
   * stays correct when a render fails. */
  readonly treeView: TreeView | null;
  /** Name → reference paths, for a named style's impact scope. */
  readonly styleUsage: StyleUsage | null;
  /** Name → reference paths for a named FORMAT: the registry section's impact
   * scope, and what a rename/delete rewrites. Filtered by the definitions —
   * a `format:` on a non-dated binding is a builtin variant pick, never a
   * registry reference. */
  readonly formatUsage: FormatUsage | null;
  /** The engine's format catalog for this document, plus the pattern probe. */
  readonly formats: FormatCatalogState;
  /** What the document's `defaults.locale` pick DOES, as the engine's own
   * rendered samples. `null` until the engine answers, and permanently on a
   * transport that cannot — the panel then explains nothing. */
  readonly localeFacts: LocaleFacts | null;
  /** The static engine defaults plus the locale's default face (when the host
   * supplied it), so an unset inherited key reads as its real default. */
  readonly styleFloor: Readonly<Record<string, string>>;
}

export function useDocDerived(input: DocDerivedInput): DocDerived {
  const { text, defaultFontFamily, transport, paletteGroups, localeTag, localePacks } = input;
  const treeView = useMemo(() => buildTree(text), [text]);
  const styleUsage = useMemo(() => buildStyleUsage(text), [text]);
  // The definitions decide which bindings are DATED, and only a dated binding
  // can reach the registry — without them a `format: symbol` on a currency
  // field would read as a reference to an entry called `symbol`.
  const formatUsage = useMemo(() => buildFormatUsage(text, paletteGroups), [text, paletteGroups]);
  const styleFloor = useMemo(() => buildStyleFloor(defaultFontFamily), [defaultFontFamily]);
  // Keyed on the catalog-relevant SLICE, so a body keystroke costs no engine
  // call while a format-default edit costs exactly one. The locale facts
  // depend on the same slice — `defaults.locale` and `defaults.currency` are
  // both inside it — so the two share the key.
  const key = useMemo(() => formatCatalogKey(text), [text]);
  const formats = useFormatCatalog({ transport, text, key });
  const localeFacts = useLocaleFacts({ transport, text, key, tag: localeTag, localePacks });
  return { treeView, styleUsage, formatUsage, styleFloor, formats, localeFacts };
}
