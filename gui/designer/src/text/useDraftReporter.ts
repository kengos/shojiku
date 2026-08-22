// Reporting an edit that is still IN PROGRESS. The chip editor commits on blur,
// so without this nothing on screen moves while a reader types — and the
// property panel's only confirmation channel is the canvas.
//
// An IME composition is tracked as a FLAG rather than read off the event:
// `InputEvent.isComposing` needs a cast on React's synthetic event, and jsdom
// leaves such boolean DOM getters `undefined` rather than `false`, so a test
// would pass straight over a broken guard. The callback rides a ref so a
// one-shot exit effect can reach the CURRENT listener — the prop's identity
// changes every render.
//
// This hook publishes and withdraws; it does not decide what an UNMOUNT means.
// That is a commit decision and belongs to `TextEditor`, which owns the value.

import { type MutableRefObject, useRef } from 'react';
import { serializeEditor } from './chipModel';
import type { PendingDecl } from './declModel';

export type DraftListener = (
  draft: { readonly value: string; readonly declarations: readonly PendingDecl[] } | null,
) => void;

export interface DraftReporter {
  /** True while an IME composition is open — callers skip publishing. */
  readonly composing: MutableRefObject<boolean>;
  /** Publish the surface's current content as the in-progress edit. */
  readonly publish: (el: HTMLElement) => void;
  /** Withdraw it (commit, cancel, unmount). */
  readonly withdraw: () => void;
  readonly onCompositionStart: () => void;
  readonly onCompositionEnd: (el: HTMLElement) => void;
}

export function useDraftReporter(
  onDraft: DraftListener | undefined,
  pending: readonly PendingDecl[],
): DraftReporter {
  const composing = useRef(false);
  const listener = useRef(onDraft);
  listener.current = onDraft;
  const staged = useRef(pending);
  staged.current = pending;

  const publish = (el: HTMLElement) => {
    listener.current?.({ value: serializeEditor(el), declarations: staged.current });
  };
  return {
    composing,
    publish,
    withdraw: () => listener.current?.(null),
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (el: HTMLElement) => {
      composing.current = false;
      publish(el);
    },
  };
}
