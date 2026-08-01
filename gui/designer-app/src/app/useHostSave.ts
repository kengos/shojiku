// Where an explicit save lands, and what the user is told about it.
//
// STANDALONE (no `saveTarget`): the local draft, with the store's typed outcome
// acknowledged — a quota refusal becomes a banner, not silence.
//
// MOUNTED: fail-closed through the host's `TemplateStore` with the tracked
// revision; 409/error keep the working copy and surface a localized banner, and
// edited definitions go through their OWN wire only AFTER the template save
// succeeds and only while they differ from the host's acknowledged copy. A
// monotonic edit counter captured at dispatch keeps "Saved." honest: an edit
// that lands mid-flight means the working copy is newer than what was saved, so
// nothing is claimed and nothing is cleared.

import type { DefinitionsStore, SaveOutcome, TemplateStore } from '@shojiku/designer';
import { useRef, useState } from 'react';
import type { InstalledFont } from '../fonts/library';
import { buildDraft, type DraftContext, pristineWith } from './draftSave';

/** The explicit-save lifecycle shown to the user. Mounted saves walk
 * saving → saved/conflict/error; a standalone save lands the draft store's
 * outcome directly ('saved', or 'local-error' when the browser storage write
 * failed — e.g. quota). */
export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error' | 'local-error';

export interface HostSaveOptions {
  readonly draft: DraftContext;
  /** Where an explicit save lands. Absent = standalone (the local draft). */
  readonly saveTarget: TemplateStore | undefined;
  /** Where an EXPLICIT save writes edited definitions (mounted). */
  readonly definitionsTarget: DefinitionsStore | undefined;
  readonly projectId: string | undefined;
  readonly initialDefinitionsRev: string | undefined;
  /** The mount-time engineer definitions file — the host-unsaved baseline
   * until a save is acknowledged. */
  readonly baseDefinitions: string | undefined;
  /** The live EFFECTIVE definitions text (read through a ref, since async save
   * completions look at it after the fact). */
  readonly definitions: string | undefined;
  readonly fonts: () => readonly InstalledFont[];
  readonly rev: string | undefined;
  readonly setRev: (rev: string | undefined) => void;
}

export interface HostSave {
  readonly saveState: SaveState;
  /** The compact indicator the app header shows (the richer lifecycle above
   * maps down to just saving/saved). */
  readonly titleSaveStatus: 'saving' | 'saved' | undefined;
  /** An edit (or a restore) landed: bump the in-flight counter and drop any
   * acknowledgement, which described the PREVIOUS text. */
  readonly noteEdit: () => void;
  readonly handleSave: (text: string) => void;
  /** The mounted immediate save a header rename uses (gdoc-style). */
  readonly saveToHost: (target: TemplateStore, text: string, name: string | undefined) => void;
}

export function useHostSave({
  draft,
  saveTarget,
  definitionsTarget,
  projectId,
  initialDefinitionsRev,
  baseDefinitions,
  definitions,
  fonts,
  rev,
  setRev,
}: HostSaveOptions): HostSave {
  const { drafts, docKey } = draft;
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [definitionsRev, setDefinitionsRev] = useState<string | undefined>(initialDefinitionsRev);
  // Monotonic edit counter: a save outcome only claims "saved" (and only
  // discards the local working copy) when NO edit landed while the request was
  // in flight — otherwise the copy now holds newer text than what was saved.
  const editSeq = useRef(0);
  // The definitions text the HOST last acknowledged (a successful
  // `saveDefinitions`); the dirty check baselines here, falling back to the
  // mount-time engineer file — so a saved session stops re-PUTting and an
  // unsaved one keeps its crash-recovery draft. Refs, because save completions
  // read them asynchronously.
  const savedDefsRef = useRef<string | undefined>(undefined);
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;

  // Whether the current definitions differ from what the host holds — the
  // last acknowledged save, else the mount-time engineer file.
  const defsPending = (): boolean =>
    definitionsTarget !== undefined &&
    projectId !== undefined &&
    definitionsRef.current !== undefined &&
    definitionsRef.current !== (savedDefsRef.current ?? baseDefinitions);

  // Finish a mounted save: the edit-counter guard keeps a "Saved." honest when
  // an edit lands while the request was in flight (clear + claim only when the
  // working copy is unchanged; otherwise keep the newer copy and claim
  // nothing). The local draft is cleared only when NO definitions edit is
  // still host-unsaved (a rename-path save does not carry definitions — the
  // draft is their only crash recovery until the next explicit save).
  const finishHostSave = (seq: number) => {
    if (editSeq.current === seq) {
      if (!defsPending()) {
        drafts.clear(docKey);
      }
      setSaveState('saved');
    } else {
      setSaveState('idle');
    }
  };

  // A mounted save carries the template + fonts + rev (+ the rename when set)
  // only — the sample params are engineer-owned on the host, never in the
  // payload. Shared by the explicit Save and a header rename. On an EXPLICIT
  // save (`withDefinitions`), edited definitions are written through their own
  // wire AFTER the template save succeeds — and only while they differ from the
  // host's acknowledged copy, so an unchanged session never re-PUTs; a rename
  // does not touch definitions.
  const saveToHost = (
    target: TemplateStore,
    text: string,
    name: string | undefined,
    withDefinitions = false,
  ) => {
    setSaveState('saving');
    const seq = editSeq.current;
    target
      .save(docKey, {
        text,
        fonts: fonts(),
        rev,
        ...(name !== undefined ? { name } : {}),
      })
      .then(
        (outcome: SaveOutcome) => {
          if (!outcome.ok) {
            setSaveState(outcome.kind);
            return;
          }
          setRev(outcome.rev ?? rev);
          const defsToSave = definitionsRef.current;
          if (
            withDefinitions &&
            definitionsTarget !== undefined &&
            projectId !== undefined &&
            defsPending() &&
            defsToSave !== undefined
          ) {
            definitionsTarget
              .saveDefinitions(projectId, { definitions: defsToSave, rev: definitionsRev })
              .then(
                (defOutcome: SaveOutcome) => {
                  if (defOutcome.ok) {
                    savedDefsRef.current = defsToSave;
                    setDefinitionsRev(defOutcome.rev ?? definitionsRev);
                    finishHostSave(seq);
                  } else {
                    // The template landed but the definitions did not — surface the
                    // conflict/error and keep the working copy.
                    setSaveState(defOutcome.kind);
                  }
                },
                () => setSaveState('error'),
              );
            return;
          }
          finishHostSave(seq);
        },
        () => setSaveState('error'),
      );
  };

  const handleSave = (text: string) => {
    if (saveTarget === undefined) {
      // Standalone: the explicit save persists the local draft — and must say
      // so. When the working copy equals the opened source there is nothing to
      // persist: clear any stale draft and still acknowledge (the state on disk
      // now matches the source, so "Saved." stays honest).
      if (pristineWith(draft, { text })) {
        drafts.clear(docKey);
        setSaveState('saved');
        return;
      }
      // The store returns a typed outcome (quota → error), so the silent
      // fire-and-forget of the autosave path is not enough here.
      drafts.save(docKey, buildDraft(draft, { text })).then(
        (outcome: SaveOutcome) => setSaveState(outcome.ok ? 'saved' : 'local-error'),
        () => setSaveState('local-error'),
      );
      return;
    }
    saveToHost(saveTarget, text, draft.customName, true);
  };

  return {
    saveState,
    titleSaveStatus:
      saveState === 'saving' ? 'saving' : saveState === 'saved' ? 'saved' : undefined,
    noteEdit: () => {
      editSeq.current += 1;
      // Any save acknowledgement is about the PREVIOUS text — clear it on edit
      // (in both modes) so a stale "Saved." never describes unsaved changes.
      if (saveState !== 'idle') {
        setSaveState('idle');
      }
    },
    handleSave,
    saveToHost,
  };
}
