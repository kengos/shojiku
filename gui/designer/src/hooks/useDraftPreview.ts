// The draft half of the preview loop: the ops of an edit the document has not
// accepted yet, and the template string they produce. It lives beside the
// render loop rather than inside the editing component because the CANVAS is
// what has to show the edit — the property panel's text field has no other
// channel to confirm that typing registered.
//
// A draft that cannot be derived, or that reproduces the committed text
// exactly, is no draft at all: the loop then renders the committed text and the
// session stays FRESH, so nothing downstream can pin a measurement taken from
// text the user never committed.

import type { Op } from '@shojiku/designer-core';
import { useEffect, useMemo, useState } from 'react';
import { draftTemplate } from '../preview/draftTemplate';
import { DEFAULT_DEBOUNCE_MS } from '../preview/usePreview';

export interface DraftPreview {
  /** The template to render — the draft when one derives, else the committed text. */
  readonly text: string;
  /** Whether the rendered template is an UNCOMMITTED one. */
  readonly drafting: boolean;
  /** Publish the in-progress edit as ops, or `null` to withdraw it. */
  readonly setDraftOps: (ops: readonly Op[] | null) => void;
}

export function useDraftPreview(source: string, maxBytes: number): DraftPreview {
  // Deriving is EXPENSIVE — a re-parse of the whole template, then the batch,
  // then a re-serialize: measured at ~55ms on the largest bundled example
  // (87 KB), of which the parse is ~32ms. Doing that per keystroke would block
  // the main thread on exactly the documents worth editing, and it would be
  // pure waste, since the render downstream is debounced too and every
  // derivation but the last is thrown away. So the published ops settle first
  // and only then are derived — one derivation per pause. A WITHDRAWAL is not
  // debounced: an edit that has ended must stop being rendered at once.
  const [pending, setPending] = useState<readonly Op[] | null>(null);
  const [ops, setOps] = useState<readonly Op[] | null>(null);
  useEffect(() => {
    if (pending === null) {
      setOps(null);
      return;
    }
    const timer = setTimeout(() => setOps(pending), DEFAULT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const draft = useMemo(() => {
    const derived = ops === null ? null : draftTemplate(source, ops, maxBytes);
    // An edit that serializes back to the committed text is not a draft: it
    // would re-render nothing and would only cost the session its freshness.
    return derived === source ? null : derived;
  }, [source, ops, maxBytes]);
  return { text: draft ?? source, drafting: draft !== null, setDraftOps: setPending };
}
