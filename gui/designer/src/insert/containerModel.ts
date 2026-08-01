// Pure model for the container-insert picker (the insert menu's container picker
// n×m grid): the shape→wire mapping (one row → flex row, one column → flex
// column, two-dimensional → grid with a column COUNT), the placeholder-slot
// scaffold, and the picker bounds. Framework-free like insert/model.ts so the
// picker dialog stays thin over it. The user never picks "flex vs grid" by
// name — the traced shape decides. The scaffold was probed against the real
// engine to render diagnostics-free AND visibly (texts side by side / stacked
// / tiled); placeholder text children carry no box so flex/grid sizes them.

import type { SnippetValue } from '@shojiku/designer-core';

/** Picker bounds (a 6×4 trace grid). The shape mapper clamps ANY caller input
 * into these, so a hostile prop can never mint an oversized scaffold. */
export const PICKER_MAX_COLUMNS = 6;
export const PICKER_MAX_ROWS = 4;

/** Scaffold gaps (pt): visible slot separation without eating sheet space. */
export const ROW_GAP_PT = 8;
export const COLUMN_GAP_PT = 6;
export const GRID_GAP_PT = 6;

/** The three shapes the picker inserts — also the panel's layout-mode
 * vocabulary (row / stack / grid words). */
export type ContainerKind = 'row' | 'column' | 'grid';

export interface ContainerShape {
  readonly kind: ContainerKind;
  readonly columns: number;
  readonly rows: number;
}

/** Classify a picker cell (1-based columns × rows) into the container shape it
 * inserts: one row → a flex row, one column → a flex column,
 * anything two-dimensional → a grid. Non-finite input → `null` (fail
 * closed); fractional/out-of-range input clamps into the picker bounds. */
export function containerShape(columns: number, rows: number): ContainerShape | null {
  if (!Number.isFinite(columns) || !Number.isFinite(rows)) {
    return null;
  }
  const c = Math.min(PICKER_MAX_COLUMNS, Math.max(1, Math.floor(columns)));
  const r = Math.min(PICKER_MAX_ROWS, Math.max(1, Math.floor(rows)));
  if (r === 1) {
    return { kind: 'row', columns: c, rows: 1 };
  }
  if (c === 1) {
    return { kind: 'column', columns: 1, rows: r };
  }
  return { kind: 'grid', columns: c, rows: r };
}

function placeholders(count: number, text: string): SnippetValue[] {
  return Array.from({ length: count }, () => ({ type: 'text', text }));
}

/** The container scaffold a picked shape inserts — ONE `insertItem` value
 * (one undo step). `direction` is authored explicitly both ways so the direction
 * segment's `setScalar` edits the same key the scaffold wrote (symmetric,
 * self-documenting YAML); a grid authors a column COUNT (the equal split —
 * ratio tracks are a later panel edit). Slots are honest placeholder TEXT
 * children: visible immediately, inline-editable, flexGrow-ready. */
export function containerSnippet(shape: ContainerShape, placeholderText: string): SnippetValue {
  if (shape.kind === 'row') {
    return {
      type: 'container',
      box: { direction: 'row', gap: ROW_GAP_PT },
      items: placeholders(shape.columns, placeholderText),
    };
  }
  if (shape.kind === 'column') {
    return {
      type: 'container',
      box: { direction: 'column', gap: COLUMN_GAP_PT },
      items: placeholders(shape.rows, placeholderText),
    };
  }
  return {
    type: 'container',
    box: { type: 'grid', columns: shape.columns, gap: GRID_GAP_PT },
    items: placeholders(shape.columns * shape.rows, placeholderText),
  };
}

/** The keys whose presence turns a slot into authored CONTENT (never
 * silently replaced/dropped): a binding, its own box/style, applied styles, or
 * an id handle. A bare `{type:text, text}` carries none. */
const CONTENT_KEYS = ['data', 'box', 'style', 'styleNames', 'id'] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether `node` is an untouched placeholder slot — a scaffold text child the
 * user has not turned into content, so nest-into-slot may REPLACE it and a grid
 * shrink may DROP it silently. True iff it is a plain map of `type: text` with
 * NO content key (`data`/`box`/`style`/`styleNames`/`id`) and `text` absent,
 * empty, or exactly the scaffold default `defaultText` (what `containerSnippet`
 * / `addSlot` write). Anything else — bound, boxed, styled, id'd, or carrying
 * user prose — is content-bearing (`false`). A non-map / non-text node is
 * `false` (never a placeholder). The `defaultText` match is locale-current: a
 * slot authored under a different locale's default reads as content, which is
 * the safe degradation (append/keep, never replace/drop). */
export function isPlaceholderSlot(node: unknown, defaultText: string): boolean {
  const record = asRecord(node);
  if (record === undefined || record.type !== 'text') {
    return false;
  }
  for (const key of CONTENT_KEYS) {
    if (record[key] !== undefined) {
      return false;
    }
  }
  const text = record.text;
  return text === undefined || text === '' || text === defaultText;
}
