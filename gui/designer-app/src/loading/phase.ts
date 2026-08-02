// What a preset open is WAITING on, as three named stages. Opening a preset
// waits on two different transfers in sequence — the engine module (app-global,
// possibly already done) then the locale's font packs (per open, the heavy one
// on the JP path) — and finishes with laying out the first preview. Naming them
// is what makes a 20-second wait legible; a single unlabeled spinner is not.
//
// Pure derivation over the two things the app actually knows: the app-global
// module load and whatever the open flow has reported. Keeping it a function
// means the view has no state machine of its own to drift.

import type { ModuleLoad } from './moduleLoad';
import { type ByteProgress, type ProgressReading, readProgress } from './progress';

/** The stages, in the order they run. */
export type StageId = 'engine' | 'fonts' | 'render';

/** A stage's state in the list. */
export type StageState = 'done' | 'active' | 'todo' | 'failed';

/** The stages, in the order they run. */
const ORDER: readonly StageId[] = ['engine', 'fonts', 'render'];

/** Where the open is. Only the two transfer phases carry bytes; `render` is
 * work, not a download, so it has nothing to measure. `failed` names the stage
 * that broke — the wait cannot be sat out, and which stage it was is the only
 * useful thing left to say about it. */
export type LoadPhase =
  | { readonly kind: 'engine'; readonly bytes: ByteProgress }
  | { readonly kind: 'fonts'; readonly bytes: ByteProgress }
  | { readonly kind: 'render' }
  | { readonly kind: 'failed'; readonly stage: StageId };

/** What the open flow reports up as it goes: font bytes while the packs land,
 * `prepared` once the engine is booted and only the first layout remains, or
 * `failed` when preparing rejected outright (a pack that will not fetch, an
 * engine that will not boot). */
export type OpenStep =
  | { readonly kind: 'fonts'; readonly bytes: ByteProgress }
  | { readonly kind: 'prepared' }
  | { readonly kind: 'failed' };

export interface StageView {
  readonly id: StageId;
  readonly state: StageState;
}

/** The stage the phase is ON — the one whose name describes the wait (or the
 * one that failed). Total, so no call site needs a fallback. */
export function activeStage(phase: LoadPhase): StageId {
  switch (phase.kind) {
    case 'engine':
      return 'engine';
    case 'fonts':
      return 'fonts';
    case 'render':
      return 'render';
    case 'failed':
      return phase.stage;
  }
}

/** The three stage rows for a phase, always in run order so the list never
 * reorders under the user mid-wait: everything before the current stage is done,
 * everything after is pending, and the current one is either running or broken. */
export function stageViews(phase: LoadPhase): readonly StageView[] {
  const at = ORDER.indexOf(activeStage(phase));
  const current: StageState = phase.kind === 'failed' ? 'failed' : 'active';
  return ORDER.map((id, i) => ({
    id,
    state: i < at ? 'done' : i > at ? 'todo' : current,
  }));
}

/** The active stage's determinate reading, or `null` when there is nothing
 * measurable (the render stage, a failure, or a transfer with no usable total)
 * and the bar must run indeterminate. */
export function phaseReading(phase: LoadPhase): ProgressReading | null {
  if (phase.kind === 'engine' || phase.kind === 'fonts') {
    return readProgress(phase.bytes);
  }
  return null;
}

/** Derive the phase from the app-global module load plus the open flow's own
 * report.
 *
 * Failures win outright — neither can be waited out, and saying so beats a bar
 * that never moves. The module's own failure is attributed to the engine stage;
 * a rejection from the open flow is attributed to the fonts stage, which is the
 * work it was doing (booting the engine over its font packs). Otherwise the
 * module load leads (the open genuinely waits on it), then the flow's report.
 * `ready` with nothing reported yet is the sliver between the module landing and
 * the first font byte: still the fonts stage, just with no total to show. */
export function phaseOf(load: ModuleLoad, step: OpenStep | null): LoadPhase {
  if (load.kind === 'failed') {
    return { kind: 'failed', stage: 'engine' };
  }
  if (step !== null && step.kind === 'failed') {
    return { kind: 'failed', stage: 'fonts' };
  }
  if (load.kind === 'loading') {
    return { kind: 'engine', bytes: load.bytes };
  }
  if (step === null) {
    return { kind: 'fonts', bytes: { loaded: 0 } };
  }
  if (step.kind === 'prepared') {
    return { kind: 'render' };
  }
  return { kind: 'fonts', bytes: step.bytes };
}
