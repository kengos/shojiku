// Pure model for the `line` item's own stroke shape. A line keeps
// `width`/`color`/`opacity`/`style` under its own `style:` map (it is the one
// shape off the unified `Style`), so the map-aware border model cannot read or
// write it — but the write rules are the same: author only the property that
// actually changed, and drop a key rather than authoring the engine's default.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { type BorderStyleValue, MAX_STROKE_WIDTH } from './borderTypes';

/** A line's stroke, as the panel edits it. `color: ''` = the engine default
 * (black); `style` is always concrete (`solid` when unauthored) so the select
 * shows the effective choice rather than an unlabelled empty option. */
export interface LineStyleView {
  /** The authored width as text (`''` = unset, which draws at 1pt). */
  readonly width: string;
  readonly color: string;
  readonly style: BorderStyleValue;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A finite non-negative number as its authored text; anything else (hostile
 * in-memory values, strings, maps) reads as unset. */
function widthText(raw: unknown): string {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? String(raw) : '';
}

/** A keyword the engine accepts, else `solid` — an unknown in-memory value
 * must not put a keyword in the picker that the engine would reject. */
function styleValue(raw: unknown, known: readonly BorderStyleValue[]): BorderStyleValue {
  return known.find((value) => value === raw) ?? 'solid';
}

/** Read the line's stroke at `path`. `known` is the keyword set the picker
 * offers (passed in so this module needs no import cycle back to the border
 * model's constant). */
export function readLineStyle(
  read: ReadFn,
  path: string,
  known: readonly BorderStyleValue[],
): LineStyleView {
  let style: Record<string, unknown> = {};
  try {
    style = record(record(read(path))?.style) ?? {};
  } catch {
    // A hostile document shape reads as an unstyled line rather than throwing
    // through the panel render.
  }
  return {
    width: widthText(style.width),
    color: typeof style.color === 'string' ? style.color : '',
    style: styleValue(style.style, known),
  };
}

/** One property's desired next value; the others stay untouched. */
export interface LineStyleEdit {
  readonly width?: string;
  readonly color?: string;
  readonly style?: BorderStyleValue;
}

/** A scalar write, or a removal when the value is the engine's own default —
 * authoring `solid` or an empty colour would put a value in the file the user
 * never chose. */
function scalarOp(path: string, key: string, value: string | number | null): Op {
  const keys = ['style', key];
  return value === null ? { op: 'removeKey', path, keys } : { op: 'setScalar', path, keys, value };
}

/** The ops for one edit, or `[]` when nothing changed. */
export function lineStyleOps(path: string, view: LineStyleView, edit: LineStyleEdit): Op[] {
  if (edit.style !== undefined && edit.style !== view.style) {
    // `solid` is the engine default: remove the key rather than author it.
    return [scalarOp(path, 'style', edit.style === 'solid' ? null : edit.style)];
  }
  if (edit.color !== undefined && edit.color !== view.color) {
    return [scalarOp(path, 'color', edit.color === '' ? null : edit.color)];
  }
  if (edit.width !== undefined) {
    const text = edit.width.trim();
    if (text === view.width) {
      return [];
    }
    if (text === '') {
      return [scalarOp(path, 'width', null)];
    }
    const value = Number(text);
    // A non-numeric or negative entry is refused outright: the engine takes a
    // bare pt number here (no unit strings), so there is nothing to preserve.
    // An over-cap entry is clamped rather than refused, exactly as the border
    // pen clamps — the engine would only warn (`invalid_line_width`) and draw
    // at 1pt, so a hostile pen must not be able to author the value at all.
    return Number.isFinite(value) && value >= 0
      ? [scalarOp(path, 'width', Math.min(value, MAX_STROKE_WIDTH))]
      : [];
  }
  return [];
}
