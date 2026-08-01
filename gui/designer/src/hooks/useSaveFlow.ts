// Validate-before-save, fail-closed, plus the save/export review pane the File
// menu opens first. A fresh validate runs at save time (never the preview
// diagnostics): errors block; warnings pass; a validate throw/reject blocks with
// an error state — the save never proceeds on an unknown result.

import { useCallback, useState } from 'react';
import type { EngineTransport } from '../engine/transport';

export type SaveState = 'idle' | 'blocked' | 'error';

/** The open review (null = closed) carries its mode AND the action its confirm
 * runs — so the confirm never re-derives which action from a nullable mode. */
export interface ReviewRequest {
  readonly mode: 'save' | 'export';
  readonly run: () => void | Promise<void>;
}

export interface SaveFlowOptions {
  readonly transport: EngineTransport;
  readonly text: string;
  readonly params: string;
  readonly definitionsForEngine: string | undefined;
  readonly onSave: ((text: string) => void) | undefined;
  /** The mount source seeds the opened-document baseline the review diffs. */
  readonly source: string;
}

export interface SaveFlow {
  readonly saveState: SaveState;
  readonly review: ReviewRequest | null;
  readonly setReview: (review: ReviewRequest | null) => void;
  /** The OPENED-document baseline the diff compares against: seeded from the
   * mount source, reseeded on a whole-document swap (the tutorial's practice
   * document), and advanced on a save that proceeds. */
  readonly baselineText: string;
  readonly setBaselineText: (text: string) => void;
  readonly confirmSave: () => Promise<void>;
}

export function useSaveFlow({
  transport,
  text,
  params,
  definitionsForEngine,
  onSave,
  source,
}: SaveFlowOptions): SaveFlow {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [review, setReview] = useState<ReviewRequest | null>(null);
  const [baselineText, setBaselineText] = useState(source);

  const save = useCallback(async (): Promise<boolean> => {
    try {
      const diagnostics = await transport.validate(text, params, definitionsForEngine);
      if (diagnostics.items.some((d) => d.severity === 'error')) {
        setSaveState('blocked');
        return false;
      }
      setSaveState('idle');
      onSave?.(text);
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, [transport, text, params, definitionsForEngine, onSave]);

  // The save review's confirm: run the actual validate-then-save the pane
  // gated. A save that PROCEEDS (validation passed) advances the baseline so the
  // next review shows only new changes; a blocked/failed save keeps it, so the
  // unsaved diff still shows. Cancel/×/Escape never reach here.
  const confirmSave = useCallback(async () => {
    if (await save()) {
      setBaselineText(text);
    }
  }, [save, text]);

  return { saveState, review, setReview, baselineText, setBaselineText, confirmSave };
}
