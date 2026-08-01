// The preview loop: re-render on every document change, debounced, with the
// latest edit winning. Correlation lives in the pure reducer (a result is
// applied only if its revision still matches the latest edit), so this hook is
// thin: bump a revision, debounce a render, dispatch the result. A superseded
// render's result is dropped by the reducer; the pending debounce timer is
// cleared on the next edit or unmount.

import { useEffect, useReducer, useRef } from 'react';
import { errorText } from '../engine/errors';
import type { EngineTransport } from '../engine/transport';
import { INITIAL_PREVIEW, type PreviewState, previewReducer } from './reducer';

export const DEFAULT_SCALE = 2;
export const DEFAULT_DEBOUNCE_MS = 250;

export interface UsePreviewOptions {
  readonly params: string;
  readonly definitions?: string;
  readonly scale?: number;
  readonly debounceMs?: number;
}

export function usePreview(
  transport: EngineTransport,
  template: string,
  options: UsePreviewOptions,
): PreviewState {
  const { params, definitions, scale = DEFAULT_SCALE, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [state, dispatch] = useReducer(previewReducer, INITIAL_PREVIEW);
  const revisionRef = useRef(0);

  useEffect(() => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    dispatch({ type: 'edit', revision });
    const timer = setTimeout(() => {
      transport
        .renderRaw(template, params, definitions, { scale })
        // Tag the result with the scale it rendered at: the zoom may have moved
        // on by the time it lands, and the canvas needs the real scale to align
        // the overlay and size the interim transform.
        .then((outcome) => dispatch({ type: 'result', revision, outcome, scale }))
        .catch((cause: unknown) =>
          dispatch({ type: 'failed', revision, message: errorText(cause) }),
        );
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [transport, template, params, definitions, scale, debounceMs]);

  return state;
}
