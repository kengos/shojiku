// The pure preview state machine. It owns snapshot correlation: every edit
// bumps a monotonic `revision`, and an async render result is applied ONLY when
// its revision still matches the latest edit — a stale render/inspect from a
// superseded document is dropped, never painted over a newer one. It also owns
// last-good retention: the PAINTABLE part of the newest ok render (`lastGood`)
// survives both failure modes — a transport throw ('failed') AND an `ok: false`
// outcome (parse/validate error, which resolves normally with zero pages) — so
// an invalid mid-edit document never blanks the canvas; the fresh diagnostics
// still surface through `outcome`. Keeping this pure (no timers, no transport)
// makes the correlation exhaustively testable; the hook (`usePreview`) drives
// it.

import type { RenderOutcome } from '../engine/transport';
import type { InspectEnvelope, RawPage } from '../engine/types';

export type PreviewStatus = 'idle' | 'rendering' | 'ready' | 'error';

/** The paintable part of the newest ok render: what the canvas shows, kept
 * through later failed/not-ok results. `scale` is the device px per pt these
 * pages were rasterized at — the overlay and the interim CSS transform must
 * use it, not the (possibly newer) requested scale. */
export interface LastGoodPreview {
  readonly pages: readonly RawPage[];
  readonly inspect: InspectEnvelope | null;
  readonly scale: number;
}

export interface PreviewState {
  readonly status: PreviewStatus;
  /** Revision of the latest edit — what a result must match to be applied. */
  readonly revision: number;
  /** Revision whose outcome is currently shown (`null` before the first). */
  readonly rendered: number | null;
  /** The latest applied outcome — diagnostics always reflect it, even when
   * `ok: false` left the painted pages on an older `lastGood`. */
  readonly outcome: RenderOutcome | null;
  /** What the canvas paints (`null` before the first ok render). */
  readonly lastGood: LastGoodPreview | null;
  /** Device px per pt the shown (`lastGood`) pages were rasterized at (`null`
   * before the first ok result). The zoom control reads this to size the box
   * overlay and compute the interim CSS transform — a render lags the zoom by
   * a debounce, so the displayed pages may be at an older scale than the
   * current zoom. */
  readonly renderedScale: number | null;
  readonly error: string | null;
}

export const INITIAL_PREVIEW: PreviewState = {
  status: 'idle',
  revision: 0,
  rendered: null,
  outcome: null,
  lastGood: null,
  renderedScale: null,
  error: null,
};

export type PreviewEvent =
  | { readonly type: 'edit'; readonly revision: number }
  | {
      readonly type: 'result';
      readonly revision: number;
      readonly outcome: RenderOutcome;
      readonly scale: number;
    }
  | { readonly type: 'failed'; readonly revision: number; readonly message: string };

export function previewReducer(state: PreviewState, event: PreviewEvent): PreviewState {
  switch (event.type) {
    case 'edit':
      return { ...state, status: 'rendering', revision: event.revision };
    case 'result': {
      // Drop a stale result: a newer edit has already bumped the revision.
      if (event.revision !== state.revision) {
        return state;
      }
      // An ok result becomes the new paintable preview; a not-ok one keeps the
      // previous `lastGood` (and its scale) on screen and only refreshes the
      // outcome, whose diagnostics explain the failure.
      const lastGood = event.outcome.ok
        ? { pages: event.outcome.pages, inspect: event.outcome.inspect, scale: event.scale }
        : state.lastGood;
      return {
        status: 'ready',
        revision: state.revision,
        rendered: event.revision,
        outcome: event.outcome,
        lastGood,
        renderedScale: lastGood?.scale ?? null,
        error: null,
      };
    }
    case 'failed':
      if (event.revision !== state.revision) {
        return state;
      }
      return { ...state, status: 'error', error: event.message };
  }
}
