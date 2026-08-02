// Sample-data ownership: the editor owns the sample data after mount (the
// data-item editor edits it). The sample data is a SET of named variants
// (filled sample / blank …) the preview switches between; a simple host that passed only
// `params` gets a one-variant set. The ACTIVE variant's text is what
// preview/validate/stub read. In workshop mode — no engineer definitions and
// editable sample data — a definitions stub is inferred from the active data to
// drive the palette + validation.

import { useMemo, useRef, useState } from 'react';
import {
  EMPTY_SAMPLE_HISTORY,
  popSampleHistory,
  pushSampleHistory,
  type SampleHistory,
} from '../sample/history';
import { inferDefinitions } from '../sample/inferStub';
import { parseParams } from '../sample/model';
import {
  activeText,
  buildSampleSet,
  type SampleSet,
  switchVariant,
  updateActive,
} from '../sample/variants';

export interface SampleDataOptions {
  /** The INITIAL params (JSON) — seeds the single-variant fallback. */
  readonly initialParams: string;
  /** The INITIAL variant set; takes precedence over `initialParams`. */
  readonly initialSampleSet: SampleSet | undefined;
  readonly onSampleSetChange: ((set: SampleSet) => void) | undefined;
  readonly onParamsChange: ((params: string) => void) | undefined;
  /** The engineer definitions prop — absent (with editable sample data) is what
   * puts the session in workshop mode. */
  readonly definitions: string | undefined;
  readonly sampleDataReadOnly: boolean;
}

export interface SampleData {
  readonly sampleSet: SampleSet;
  /** The live set, for callbacks that must stay stable while seeing the newest
   * variants (the tutorial host). */
  readonly sampleSetRef: { readonly current: SampleSet };
  readonly sampleHistory: SampleHistory;
  /** The ACTIVE variant's text — what preview/validate/stub read. */
  readonly params: string;
  readonly commitSet: (next: SampleSet) => void;
  /** A field edit rewrites the ACTIVE variant's text (the caller reports the
   * tutorial ui-event; this is the state half). */
  readonly applyParamsEdit: (next: string) => void;
  readonly handleSwitch: (id: string) => void;
  readonly handleVariantCommit: (next: SampleSet) => void;
  readonly undoSample: () => void;
  readonly workshop: boolean;
  /** The definitions stub inferred from the sample data (workshop mode only). */
  readonly stub: string | undefined;
}

export function useSampleData({
  initialParams,
  initialSampleSet,
  onSampleSetChange,
  onParamsChange,
  definitions,
  sampleDataReadOnly,
}: SampleDataOptions): SampleData {
  const [sampleSet, setSampleSet] = useState<SampleSet>(
    () => initialSampleSet ?? buildSampleSet(initialParams, []),
  );
  // The tutorial host reads the live set through a ref, so its callbacks stay
  // stable while still seeing the newest variants.
  const sampleSetRef = useRef(sampleSet);
  sampleSetRef.current = sampleSet;
  // The sample-data panel's OWN undo ring (session-local, never the template
  // stack): prior active-variant texts. Cleared when the active variant changes
  // (switch / add / remove) — the undo context is the current variant.
  const [sampleHistory, setSampleHistory] = useState(EMPTY_SAMPLE_HISTORY);
  const params = activeText(sampleSet);
  // Apply a variant-set mutation: notify the whole-set host, and — when the
  // ACTIVE text changed (switch/edit, never a same-text add) — the simple
  // `onParamsChange` host too. A no-op mutation (unchanged set reference)
  // changes nothing.
  const commitSet = (next: SampleSet) => {
    if (next === sampleSet) {
      return;
    }
    setSampleSet(next);
    onSampleSetChange?.(next);
    const nextText = activeText(next);
    if (nextText !== params) {
      onParamsChange?.(nextText);
    }
  };
  const workshop = definitions === undefined && !sampleDataReadOnly;
  // A stub is inferred only once sample DATA exists — pristine blank-start
  // (empty params) shows no palette and reports no stub, avoiding an empty
  // "Data fields" tab and `empty_definitions` noise.
  const stub = useMemo(() => {
    if (!workshop) {
      return undefined;
    }
    const root = parseParams(params);
    return root === null || Object.keys(root).length === 0 ? undefined : inferDefinitions(params);
  }, [workshop, params]);
  // A field edit rewrites the ACTIVE variant's text; switch/add/remove commit a
  // whole set. All route through `commitSet`.
  const applyParamsEdit = (next: string) => {
    // Record the pre-edit text as an undo target before committing (only when
    // the edit actually changes the active text — a no-op blur adds nothing).
    /* v8 ignore next 4 -- every live caller (the sample panel) already drops unchanged text; kept because the onChange contract does not promise it. */
    if (next === params) {
      commitSet(updateActive(sampleSet, next));
      return;
    }
    setSampleHistory((history) => pushSampleHistory(history, params));
    commitSet(updateActive(sampleSet, next));
  };
  const handleSwitch = (id: string) => {
    // A different variant is a fresh undo context.
    setSampleHistory(EMPTY_SAMPLE_HISTORY);
    commitSet(switchVariant(sampleSet, id));
  };
  // Add/remove a variant also resets the undo context (the active variant may
  // change), then commits the whole set.
  const handleVariantCommit = (next: SampleSet) => {
    setSampleHistory(EMPTY_SAMPLE_HISTORY);
    commitSet(next);
  };
  // Undo one sample edit: restore the newest prior text into the active variant.
  // Routes through `commitSet` directly (NOT `applyParamsEdit`) so the restore
  // does not re-push onto the ring.
  const undoSample = () => {
    const popped = popSampleHistory(sampleHistory);
    /* v8 ignore next 3 -- the Undo button is disabled exactly when the pop would be null; kept as a disabled-click race guard. */
    if (popped === null) {
      return;
    }
    setSampleHistory(popped.history);
    commitSet(updateActive(sampleSet, popped.text));
  };

  return {
    sampleSet,
    sampleSetRef,
    sampleHistory,
    params,
    commitSet,
    applyParamsEdit,
    handleSwitch,
    handleVariantCommit,
    undoSample,
    workshop,
    stub,
  };
}
