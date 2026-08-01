// Definitions ownership: definitions are EDITABLE in the data-item editor. Each
// edit is a CST-preserving op, coalesced by target (re-editing a leaf replaces
// its op). They apply over a BASE doc — the engineer file, the workshop stub, or
// a minimal empty-properties doc once an edit exists but no base does (a
// blank-start add) — RE-APPLIED each render, so a field added through any flow
// (re-inferred into the workshop stub) never desyncs from its edits.

import type { Op } from '@shojiku/designer-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyDefinitionOps, coalesceDefsEdit } from '../data/definitionsEdit';
import {
  type DefsHistory,
  EMPTY_DEFS_HISTORY,
  popDefsHistory,
  pushDefsHistory,
} from '../data/defsHistory';
import { sanitizeDefsEdits } from '../data/defsPlan';
import { type PaletteGroup, readDefinitionsView } from '../palette/model';

/** The base a definition edit applies over when nothing else exists yet — a
 * blank-start add-field (no engineer file, no inferred stub). */
const EMPTY_DEFINITIONS = 'type: object\nproperties: {}\n';

export interface DefinitionsOwnershipOptions {
  /** The engineer definitions prop (the BASE the edits apply over). */
  readonly definitions: string | undefined;
  /** The workshop mode stub inferred from the sample data — the base when there is
   * no engineer file. */
  readonly stub: string | undefined;
  /** A restored session's definition-edit ops (untrusted host storage). */
  readonly initialDefinitionsEdits: readonly Op[] | undefined;
  readonly onDefinitionsChange: ((definitions: string, edits?: readonly Op[]) => void) | undefined;
}

export interface DefinitionsOwnership {
  readonly defsHistory: DefsHistory;
  readonly editDefinition: (op: Op) => void;
  readonly undoDefinition: () => void;
  /** What the palette + the data-item editor read. */
  readonly effectiveDefinitions: string | undefined;
  /** What preview/validate consume (a pristine workshop stub never reaches the
   * engine — it would only inject unknown-key noise). */
  readonly definitionsForEngine: string | undefined;
  /** The palette's read-only view over the effective definitions (null when
   * there are none — no engineer file and nothing inferred). */
  readonly paletteGroups: readonly PaletteGroup[] | null;
}

export function useDefinitionsOwnership({
  definitions,
  stub,
  initialDefinitionsEdits,
  onDefinitionsChange,
}: DefinitionsOwnershipOptions): DefinitionsOwnership {
  const [defsEdits, setDefsEdits] = useState<readonly Op[]>(() =>
    sanitizeDefsEdits(initialDefinitionsEdits),
  );
  // Definition edits get their OWN panel-local undo ring, separate from the
  // template ⌘Z and the sample-data ring (three documents, three undo contexts;
  // merging any two would corrupt trust — the sample-history rationale). Each
  // edit snapshots the PRE-edit coalesced op list; undo restores it.
  const [defsHistory, setDefsHistory] = useState<DefsHistory>(EMPTY_DEFS_HISTORY);
  const editDefinition = (op: Op) => {
    setDefsHistory((history) => pushDefsHistory(history, defsEdits));
    setDefsEdits((edits) => coalesceDefsEdit(edits, op));
  };
  // Undo one definition edit: restore the newest prior coalesced op list. Routes
  // `setDefsEdits` directly (NOT `editDefinition`) so the restore does not
  // re-push onto the ring.
  const undoDefinition = () => {
    const popped = popDefsHistory(defsHistory);
    /* v8 ignore next 3 -- the Undo button is disabled exactly when the pop would be null; kept as a disabled-click race guard. */
    if (popped === null) {
      return;
    }
    setDefsHistory(popped.history);
    setDefsEdits(popped.snapshot);
  };
  const defsBase = definitions ?? stub;
  const effectiveDefinitions = useMemo(() => {
    const base = defsBase ?? (defsEdits.length > 0 ? EMPTY_DEFINITIONS : undefined);
    return base === undefined ? undefined : applyDefinitionOps(base, defsEdits);
  }, [defsBase, defsEdits]);
  // What the engine validate/preview consumes: the engineer definitions with
  // edits folded in (always), or — blank-start — the merged workshop defs ONLY
  // once edited (a pristine/empty stub would only inject `empty_definitions`/
  // `unknown_data_key` noise, so the render stays off `definitions === undefined`
  // until the user edits).
  const definitionsForEngine = useMemo(() => {
    if (definitions !== undefined) {
      return applyDefinitionOps(definitions, defsEdits);
    }
    return defsEdits.length > 0 ? effectiveDefinitions : undefined;
  }, [definitions, defsEdits, effectiveDefinitions]);

  // Report the current effective definitions to the host (persisted for the kit
  // + the mounted definitions-save wire): the stub/edited defs, or the engineer
  // base itself once an edit is undone away. `lastReportedRef` seeds to the
  // engineer base (undefined in workshop mode) so a fresh open of an UNEDITED file is
  // a no-op — never marks it dirty — WHILE a full undo back to that base still
  // reports the revert (a `defsEdits.length > 0` gate here stayed silent on the
  // edited→[] transition, leaving the host holding the undone edit on save).
  const onDefinitionsChangeRef = useRef(onDefinitionsChange);
  onDefinitionsChangeRef.current = onDefinitionsChange;
  const reportedDefs = effectiveDefinitions;
  const defsEditsRef = useRef(defsEdits);
  defsEditsRef.current = defsEdits;
  const lastReportedRef = useRef<string | undefined>(definitions);
  useEffect(() => {
    if (reportedDefs !== undefined && reportedDefs !== lastReportedRef.current) {
      lastReportedRef.current = reportedDefs;
      onDefinitionsChangeRef.current?.(reportedDefs, defsEditsRef.current);
    }
  }, [reportedDefs]);

  const paletteGroups = useMemo(
    () => (effectiveDefinitions === undefined ? null : readDefinitionsView(effectiveDefinitions)),
    [effectiveDefinitions],
  );

  return {
    defsHistory,
    editDefinition,
    undoDefinition,
    effectiveDefinitions,
    definitionsForEngine,
    paletteGroups,
  };
}
