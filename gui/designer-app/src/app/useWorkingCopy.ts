// The opened document's working copy: the template text (seed + live), the
// sample-variant set, the effective definitions and the edit ops behind them,
// the header rename, the host revision token, and the open-driven reseed nonce
// — plus the app-global reusable-block library. State only; every mutation
// path (draft, export, host save) is built over it in `editorActions.ts`.

import type { Op, SampleSet, SavedBlock, StoredSampleSet } from '@shojiku/designer';
import { buildSampleSet, restoreSampleSet } from '@shojiku/designer';
import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';
import type { AppServices, PresetFiles } from './services';

export interface WorkingCopySeed {
  readonly services: AppServices;
  readonly files: PresetFiles;
  readonly initialText: string;
  readonly initialSample: StoredSampleSet | undefined;
  readonly initialDefinitions: string | undefined;
  readonly initialDefinitionsEdits: readonly Op[] | undefined;
  readonly initialRev: string | undefined;
  readonly initialCustomName: string | undefined;
}

export interface WorkingCopy {
  readonly sampleSet: SampleSet;
  readonly setSampleSet: Dispatch<SetStateAction<SampleSet>>;
  readonly stubDefinitions: string | undefined;
  readonly setStubDefinitions: Dispatch<SetStateAction<string | undefined>>;
  readonly defsEdits: readonly Op[] | undefined;
  readonly setDefsEdits: Dispatch<SetStateAction<readonly Op[] | undefined>>;
  /** The edit ops the Designer SEEDS from on (re)mount. It tracks the mount
   * prop, but a restore-point restore reseeds it from the LIVE `defsEdits`
   * before bumping the nonce — so restoring a point (which captures
   * text/fonts/sample, never definitions) preserves the session's definition
   * edits across the Designer remount instead of reverting to the mount set. */
  readonly seedDefsEdits: readonly Op[] | undefined;
  readonly setSeedDefsEdits: Dispatch<SetStateAction<readonly Op[] | undefined>>;
  /** The Designer's source seed; opening a file replaces the template text by
   * reseeding this and bumping `nonce` (a fresh editor for the new text). */
  readonly seedText: string;
  readonly setSeedText: Dispatch<SetStateAction<string>>;
  readonly nonce: number;
  readonly bumpNonce: () => void;
  readonly currentText: string;
  readonly setCurrentText: Dispatch<SetStateAction<string>>;
  readonly openError: boolean;
  readonly setOpenError: Dispatch<SetStateAction<boolean>>;
  readonly rev: string | undefined;
  readonly setRev: Dispatch<SetStateAction<string | undefined>>;
  /** The user's header rename, or undefined while the title still follows the
   * preset / host name. */
  readonly customName: string | undefined;
  readonly setCustomName: Dispatch<SetStateAction<string | undefined>>;
  readonly blocks: readonly SavedBlock[];
  readonly handleBlocksChange: (next: readonly SavedBlock[]) => void;
}

export function useWorkingCopy({
  services,
  files,
  initialText,
  initialSample,
  initialDefinitions,
  initialDefinitionsEdits,
  initialRev,
  initialCustomName,
}: WorkingCopySeed): WorkingCopy {
  const [sampleSet, setSampleSet] = useState<SampleSet>(() =>
    initialSample !== undefined
      ? restoreSampleSet(initialSample, files.variants)
      : buildSampleSet(files.params, files.variants),
  );
  const [stubDefinitions, setStubDefinitions] = useState<string | undefined>(initialDefinitions);
  const [defsEdits, setDefsEdits] = useState<readonly Op[] | undefined>(initialDefinitionsEdits);
  // The app-global reusable-block library — loaded once per editor mount (a
  // single shared key), persisted best-effort on every change. Cross-document,
  // so it is NOT tied to `docKey`.
  const [blocks, setBlocks] = useState<readonly SavedBlock[]>(() => services.blocks.load());
  const handleBlocksChange = useCallback(
    (next: readonly SavedBlock[]) => {
      setBlocks(next);
      services.blocks.save(next);
    },
    [services.blocks],
  );
  const [seedDefsEdits, setSeedDefsEdits] = useState<readonly Op[] | undefined>(
    initialDefinitionsEdits,
  );
  const [seedText, setSeedText] = useState(initialText);
  const [nonce, setNonce] = useState(0);
  const [currentText, setCurrentText] = useState(initialText);
  const [openError, setOpenError] = useState(false);
  const [rev, setRev] = useState<string | undefined>(initialRev);
  const [customName, setCustomName] = useState<string | undefined>(initialCustomName);

  return {
    sampleSet,
    setSampleSet,
    stubDefinitions,
    setStubDefinitions,
    defsEdits,
    setDefsEdits,
    seedDefsEdits,
    setSeedDefsEdits,
    seedText,
    setSeedText,
    nonce,
    bumpNonce: () => setNonce((n) => n + 1),
    currentText,
    setCurrentText,
    openError,
    setOpenError,
    rev,
    setRev,
    customName,
    setCustomName,
    blocks,
    handleBlocksChange,
  };
}
