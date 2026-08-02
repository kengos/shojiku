import type { Op } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import { canvasManipulate } from './canvasManipulate';

const P = 'sections.body.items[0]';

/** The editor callbacks the factory closes over, with per-call spies and a
 * configurable ok/refused outcome for each of the two write paths. */
function wiring(over: { readonly applyOk?: boolean; readonly applyAllOk?: boolean } = {}) {
  const read = (path: string): unknown => ({ path });
  const apply = vi.fn((_op: Op) => ({ ok: over.applyOk ?? true }));
  const applyAll = vi.fn((_ops: readonly Op[]) => ({ ok: over.applyAllOk ?? true }));
  const select = vi.fn((_path: string) => {});
  const selectClearing = vi.fn((_path: string) => {});
  const setRefused = vi.fn((_reason: string | null) => {});
  const manipulate = canvasManipulate({
    read: read as never,
    apply: apply as never,
    applyAll: applyAll as never,
    select,
    selectClearing: selectClearing as never,
    setRefused: setRefused as never,
    grid: 8,
  });
  return { manipulate, apply, applyAll, select, selectClearing, setRefused, read };
}

const moveOp = { op: 'moveItem', path: 'sections.body.items', from: 0, to: 2 } as unknown as Op & {
  path: string;
  to: number;
};

describe('canvasManipulate reorder', () => {
  it('applies ONE op and lets the selection travel to the drop index', () => {
    const w = wiring();
    w.manipulate.onReorder?.(moveOp as never);
    expect(w.apply).toHaveBeenCalledTimes(1);
    expect(w.select).toHaveBeenCalledWith('sections.body.items[2]');
  });

  it('moves no selection when the op layer refuses the reorder', () => {
    const w = wiring({ applyOk: false });
    w.manipulate.onReorder?.(moveOp as never);
    expect(w.apply).toHaveBeenCalledTimes(1);
    expect(w.select).not.toHaveBeenCalled();
  });
});

describe('canvasManipulate move/resize/nudge', () => {
  it('commits the whole plan as ONE transactional batch = one undo step', () => {
    const w = wiring();
    const ops = [{ op: 'setScalar' }, { op: 'setScalar' }] as unknown as readonly Op[];
    w.manipulate.onApply?.(P, ops);
    expect(w.applyAll).toHaveBeenCalledTimes(1);
    expect(w.applyAll).toHaveBeenCalledWith(ops);
    expect(w.apply).not.toHaveBeenCalled();
  });

  it('selects the manipulated item, since the drag consumes the trailing click', () => {
    const w = wiring();
    w.manipulate.onApply?.(P, [] as readonly Op[]);
    expect(w.selectClearing).toHaveBeenCalledWith(P);
  });
});

describe('canvasManipulate refusal and passthrough', () => {
  it('surfaces a refused drag reason for the placement chip', () => {
    const w = wiring();
    w.manipulate.onRefused?.('flow' as never);
    expect(w.setRefused).toHaveBeenCalledWith('flow');
  });

  it('hands the overlay the live grid step and the document read', () => {
    const w = wiring();
    expect(w.manipulate.grid).toBe(8);
    expect(w.manipulate.read).toBe(w.read);
  });
});
