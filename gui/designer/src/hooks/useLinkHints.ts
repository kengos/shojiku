// What the canvas is told about the links in the document: one entry per LINKED
// placement, carrying the destination and the localized sentence a screen
// reader hears.
//
// It lives on the SHELL side because both halves are the host's: the URL is in
// the document, which the canvas does not have (the box index says only WHETHER
// an item is linked), and the sentence is i18n, which the canvas carries none
// of. That is the `dropWarning` shape one level up — a resolved value handed
// down rather than a reader handed in.
//
// `undefined` for a document with no links, so the canvas prop stays ABSENT
// rather than present-and-empty: absent is the documented "unchanged" case, and
// a host on an older engine (no `link.url` capability, no `linked` flag) lands
// there naturally.

import { useMemo } from 'react';
import type { LinkHint } from '../canvas/linkHint';
import type { BoxIndex } from '../engine/types';
import type { I18n } from '../i18n/context';
import { readLinkUrl } from '../panel/linkModel';

export interface LinkHintsOptions {
  readonly boxes: BoxIndex;
  readonly read: (path: string) => unknown;
  readonly t: I18n['t'];
  /** The document revision the map is recomputed against (the `read` fn
   * identity is stable across edits, so the text stands in for it). */
  readonly text: string;
}

export function useLinkHints({
  boxes,
  read,
  t,
  text,
}: LinkHintsOptions): ReadonlyMap<string, LinkHint> | undefined {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `text` stands in for the document revision `read` reflects (the read fn identity is stable across edits).
  return useMemo(() => {
    const hints = new Map<string, LinkHint>();
    for (const page of boxes.pages) {
      for (const box of page) {
        // Driven by the ENGINE's flag, never by the document: the engine drops
        // a link whose scheme it refuses or whose URL is over the cap, and the
        // badge already follows what the PDF will contain rather than what the
        // template says. A hint on an item with no badge would explain a mark
        // that is not there.
        if (box.linked !== true || hints.has(box.path)) {
          continue;
        }
        const url = readLinkUrl(read, box.path);
        if (url !== '') {
          hints.set(box.path, { url, description: t('canvas.link.description', { url }) });
        }
      }
    }
    return hints.size === 0 ? undefined : hints;
  }, [boxes, read, t, text]);
}
