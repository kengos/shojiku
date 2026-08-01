import { describe, expect, it } from 'vitest';
import type { ModuleLoad } from './moduleLoad';
import { activeStage, type LoadPhase, phaseOf, phaseReading, stageViews } from './phase';

const states = (phase: LoadPhase): string[] => stageViews(phase).map((s) => s.state);
const ids = (phase: LoadPhase): string[] => stageViews(phase).map((s) => s.id);

describe('activeStage', () => {
  it('names the stage each waiting phase is on', () => {
    expect(activeStage({ kind: 'engine', bytes: { loaded: 0 } })).toBe('engine');
    expect(activeStage({ kind: 'fonts', bytes: { loaded: 0 } })).toBe('fonts');
    expect(activeStage({ kind: 'render' })).toBe('render');
  });

  // Total by construction — the view labels its bar from this, so a phase with
  // no answer would force a fallback that could silently mislabel the wait.
  it('names the stage that failed, whichever it was', () => {
    expect(activeStage({ kind: 'failed', stage: 'engine' })).toBe('engine');
    expect(activeStage({ kind: 'failed', stage: 'fonts' })).toBe('fonts');
    expect(activeStage({ kind: 'failed', stage: 'render' })).toBe('render');
  });
});

describe('stageViews', () => {
  it('keeps the three stages in run order for every phase', () => {
    const phases: LoadPhase[] = [
      { kind: 'engine', bytes: { loaded: 0 } },
      { kind: 'failed', stage: 'engine' },
      { kind: 'fonts', bytes: { loaded: 0 } },
      { kind: 'render' },
    ];
    for (const phase of phases) {
      expect(ids(phase)).toEqual(['engine', 'fonts', 'render']);
    }
  });

  it('marks the engine stage active while the module arrives', () => {
    expect(states({ kind: 'engine', bytes: { loaded: 1, total: 2 } })).toEqual([
      'active',
      'todo',
      'todo',
    ]);
  });

  it('marks the engine stage failed when the module could not be fetched', () => {
    expect(states({ kind: 'failed', stage: 'engine' })).toEqual(['failed', 'todo', 'todo']);
  });

  // A refusal partway through keeps the earlier stages' verdicts: the module DID
  // arrive, so re-marking it pending would misdescribe what happened.
  it('keeps earlier stages done when a later stage fails', () => {
    expect(states({ kind: 'failed', stage: 'fonts' })).toEqual(['done', 'failed', 'todo']);
  });

  it('marks earlier stages done once the fonts are landing', () => {
    expect(states({ kind: 'fonts', bytes: { loaded: 1, total: 2 } })).toEqual([
      'done',
      'active',
      'todo',
    ]);
  });

  it('marks both transfers done in the render stage', () => {
    expect(states({ kind: 'render' })).toEqual(['done', 'done', 'active']);
  });
});

describe('phaseReading', () => {
  it('reads the active transfer stage', () => {
    expect(phaseReading({ kind: 'engine', bytes: { loaded: 50, total: 100 } })).toMatchObject({
      percent: 50,
    });
    expect(phaseReading({ kind: 'fonts', bytes: { loaded: 25, total: 100 } })).toMatchObject({
      percent: 25,
    });
  });

  it('is indeterminate for a transfer with no usable total', () => {
    expect(phaseReading({ kind: 'fonts', bytes: { loaded: 4096 } })).toBeNull();
  });

  it('is indeterminate for the non-transfer phases', () => {
    expect(phaseReading({ kind: 'render' })).toBeNull();
    expect(phaseReading({ kind: 'failed', stage: 'engine' })).toBeNull();
    expect(phaseReading({ kind: 'failed', stage: 'fonts' })).toBeNull();
  });
});

describe('phaseOf', () => {
  const loading: ModuleLoad = { kind: 'loading', bytes: { loaded: 700, total: 1000 } };
  const ready: ModuleLoad = { kind: 'ready' };
  const failed: ModuleLoad = { kind: 'failed' };

  it('waits on the module first, carrying its bytes', () => {
    expect(phaseOf(loading, null)).toEqual({
      kind: 'engine',
      bytes: { loaded: 700, total: 1000 },
    });
  });

  it('sits in the fonts stage with no total between module-ready and the first face', () => {
    expect(phaseOf(ready, null)).toEqual({ kind: 'fonts', bytes: { loaded: 0 } });
  });

  it('carries the font bytes the open flow reports', () => {
    expect(phaseOf(ready, { kind: 'fonts', bytes: { loaded: 5, total: 10 } })).toEqual({
      kind: 'fonts',
      bytes: { loaded: 5, total: 10 },
    });
  });

  it('reaches the render stage once the engine is prepared', () => {
    expect(phaseOf(ready, { kind: 'prepared' })).toEqual({ kind: 'render' });
  });

  // A failed module cannot be waited out: saying so beats a bar that never
  // moves, and it wins over every other report.
  it('reports the module failure whatever the open flow last said', () => {
    expect(phaseOf(failed, null)).toEqual({ kind: 'failed', stage: 'engine' });
    expect(phaseOf(failed, { kind: 'fonts', bytes: { loaded: 1, total: 2 } })).toEqual({
      kind: 'failed',
      stage: 'engine',
    });
    expect(phaseOf(failed, { kind: 'prepared' })).toEqual({ kind: 'failed', stage: 'engine' });
  });

  // The open flow rejecting (a pack that will not fetch, an engine that will not
  // boot) is attributed to the work it was doing, not to the module that landed.
  it('attributes an open-flow refusal to the fonts stage', () => {
    expect(phaseOf(ready, { kind: 'failed' })).toEqual({ kind: 'failed', stage: 'fonts' });
  });

  it('still shows the module wait when the flow somehow reported ahead of it', () => {
    expect(phaseOf(loading, { kind: 'prepared' })).toMatchObject({ kind: 'engine' });
  });
});
