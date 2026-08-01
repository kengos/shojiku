import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBox } from '../engine/types';
import type { CanvasManipulate } from './overlayDragModel';
import { overlayLayers } from './overlayLayers';

const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

const placed = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

const ABS_DOC: Record<string, unknown> = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
  'sections.body.items[1]': { type: 'rect', box: { x: 0, y: 40, w: 100, h: 30 } },
};
const ABS_BOXES = [
  placed('sections.body.items[0]', 0, 0, 100, 30),
  placed('sections.body.items[1]', 0, 40, 100, 30),
];

function wiring(doc: Record<string, unknown> = ABS_DOC): CanvasManipulate {
  return {
    read: docRead(doc),
    onReorder: vi.fn(),
    onApply: vi.fn(),
    onRefused: vi.fn(),
    grid: 0,
  };
}

const EMPTY: ReadonlySet<string> = new Set();

function layersOf(over: Partial<Parameters<typeof overlayLayers>[0]> = {}) {
  return overlayLayers({
    boxes: ABS_BOXES,
    scale: 1,
    selectedPath: null,
    multiSelected: EMPTY,
    dragPath: null,
    manipulate: undefined,
    containerMarks: [],
    ...over,
  });
}

describe('overlayLayers', () => {
  it('paints shallowest-first so a container never masks its own cells', () => {
    const nested = [
      placed('sections.body.items[0].items[0]', 10, 10, 20, 20),
      placed('sections.body.items[0]', 0, 0, 100, 100),
    ];
    expect(layersOf({ boxes: nested }).ordered.map((box) => box.path)).toEqual([
      'sections.body.items[0]',
      'sections.body.items[0].items[0]',
    ]);
  });

  it('keeps equal-depth boxes in their incoming order', () => {
    expect(layersOf().ordered.map((box) => box.path)).toEqual([
      'sections.body.items[0]',
      'sections.body.items[1]',
    ]);
  });

  it('collects the marked paths the container marks already outline', () => {
    const { selection } = layersOf({
      containerMarks: [
        { path: 'sections.body.items[0]', label: 'コンテナ' },
        { path: 'sections.body.items[1]', label: 'コンテナ' },
      ],
    });
    expect([...selection.markedPaths].sort()).toEqual([
      'sections.body.items[0]',
      'sections.body.items[1]',
    ]);
  });

  it('passes the raw selection state through to the interactive layer', () => {
    const multi: ReadonlySet<string> = new Set(['sections.body.items[1]']);
    const { selection } = layersOf({
      selectedPath: 'sections.body.items[0]',
      multiSelected: multi,
      dragPath: 'sections.body.items[1]',
    });
    expect(selection.selectedPath).toBe('sections.body.items[0]');
    expect(selection.multiSelected).toBe(multi);
    expect(selection.dragPath).toBe('sections.body.items[1]');
  });

  it('has no ability and no rect while the overlay is select-only', () => {
    const { selection } = layersOf({ selectedPath: 'sections.body.items[0]' });
    expect(selection.selectedAbility).toBeNull();
    expect(selection.selectedRect).toBeNull();
  });

  it('has no ability with nothing selected, even when manipulation is wired', () => {
    expect(layersOf({ manipulate: wiring() }).selection.selectedAbility).toBeNull();
  });

  it('resolves the selected rect in overlay px for a MOVABLE selection', () => {
    const { selection } = layersOf({
      selectedPath: 'sections.body.items[1]',
      manipulate: wiring(),
      scale: 2,
    });
    expect(selection.selectedAbility?.kind).toBe('move');
    expect(selection.selectedRect).toEqual({ x: 0, y: 80, w: 200, h: 60 });
  });

  it('leaves the rect null when the selection is not movable', () => {
    const flow: Record<string, unknown> = {
      'sections.body': { type: 'flow', items: [{}, {}] },
      'sections.body.items[0]': { type: 'text', text: 'a' },
      'sections.body.items[1]': { type: 'text', text: 'b' },
    };
    const { selection } = layersOf({
      selectedPath: 'sections.body.items[0]',
      manipulate: wiring(flow),
    });
    expect(selection.selectedAbility?.kind).toBe('reorder');
    expect(selection.selectedRect).toBeNull();
  });

  it('leaves the rect null when the selected path is not on this page', () => {
    // Paths are re-synthesized every layout, so a selection the current box
    // list does not carry is ordinary — it must degrade, never throw.
    const { selection } = layersOf({
      selectedPath: 'sections.body.items[9]',
      manipulate: wiring({ ...ABS_DOC, 'sections.body.items[9]': { type: 'rect', box: {} } }),
    });
    expect(selection.selectedAbility?.kind).toBe('move');
    expect(selection.selectedRect).toBeNull();
  });

  it('frames a multi-selection of two distinct paths, and nothing below that', () => {
    expect(
      layersOf({
        selectedPath: 'sections.body.items[0]',
        multiSelected: new Set(['sections.body.items[1]']),
        manipulate: wiring(),
      }).groupBox,
    ).toEqual({ x: 0, y: 0, w: 100, h: 70 });
    expect(
      layersOf({
        selectedPath: 'sections.body.items[0]',
        multiSelected: new Set(['sections.body.items[0]']),
        manipulate: wiring(),
      }).groupBox,
    ).toBeNull();
  });

  it('frames nothing when the multi-selected paths are not on this page', () => {
    expect(
      layersOf({ multiSelected: new Set(['sections.body.items[7]', 'sections.body.items[8]']) })
        .groupBox,
    ).toBeNull();
  });
});
