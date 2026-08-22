// The contenteditable surface itself: the element the caret lives in, and the
// seven handlers that keep its content a plain-text-plus-atomic-chips document.
// Split out of `TextEditor`, which stays the seeding / commit-decision /
// staged-declaration shell — this file is the ingress, nothing else.
//
// Every DOM-mutating path here is Range surgery (atomic chip erosion, Enter's
// newline, paste, drop), which fires no `input` event, so each one drives the
// detached-chip re-check and the draft publish itself.

import type { KeyboardEvent } from 'react';
import { handleEditorKeyDown, handleEditorMouseDown, handleTextIngress } from './editorHandlers';
import type { DraftReporter } from './useDraftReporter';

export interface EditorSurfaceProps {
  readonly seedRef: (el: HTMLDivElement | null) => void;
  readonly ariaLabel?: string;
  readonly className: string;
  readonly commit: (el: HTMLElement) => void;
  /** Present only on the canvas overlay — Escape closes without committing. */
  readonly cancel?: () => void;
  readonly onSelectChip: (chip: Element | null) => void;
  readonly onDetachCheck: (el: HTMLElement) => void;
  readonly draft: DraftReporter;
}

export function EditorSurface({
  seedRef,
  ariaLabel,
  className,
  commit,
  cancel,
  onSelectChip,
  onDetachCheck,
  draft,
}: EditorSurfaceProps) {
  // After any surgery this file performs: re-check the selected chip, then
  // publish what the surface now holds.
  const after = (el: HTMLDivElement) => {
    onDetachCheck(el);
    draft.publish(el);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A commit or a cancel ENDS the edit, so neither may be followed by a
    // publish — the host has just withdrawn the draft.
    let ended = false;
    handleEditorKeyDown(event, {
      commit: (el) => {
        ended = true;
        commit(el);
      },
      cancel:
        cancel === undefined
          ? undefined
          : () => {
              ended = true;
              cancel();
            },
    });
    onDetachCheck(event.currentTarget);
    // For an ordinary character key this runs BEFORE the browser applies the
    // keystroke, so it publishes the previous content — superseded by the
    // `input` publish in the same tick, which the render debounce absorbs.
    if (!ended && !draft.composing.current) {
      draft.publish(event.currentTarget);
    }
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: rich-text editing host — input/textarea cannot host inline markup; contentEditable + role=textbox is the standard shape.
    <div
      ref={seedRef}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      className={className}
      contentEditable
      // Editing hosts are natively tab-focusable; the explicit index states it
      // for tooling that cannot see contentEditable implies it.
      tabIndex={0}
      onKeyDown={onKeyDown}
      onInput={(event) => {
        onDetachCheck(event.currentTarget);
        if (!draft.composing.current) {
          draft.publish(event.currentTarget);
        }
      }}
      onCompositionStart={draft.onCompositionStart}
      onCompositionEnd={(event) => draft.onCompositionEnd(event.currentTarget)}
      onMouseDown={(event) => onSelectChip(handleEditorMouseDown(event))}
      onDrop={(event) =>
        handleTextIngress(
          event.currentTarget,
          event,
          event.dataTransfer.getData('text/plain'),
          after,
        )
      }
      onPaste={(event) =>
        handleTextIngress(
          event.currentTarget,
          event,
          event.clipboardData.getData('text/plain'),
          after,
        )
      }
    />
  );
}
