// What a `char_grid`'s text rows read: the cascade context its own-layer keys
// resolve over, and whether its lines run vertically. Framework-free; the text
// section renders over it.
//
// The engine reads a char_grid's size and alignment from the item's OWN style
// layers only (`CHAR_GRID_OWN_KEYS`), so the panel resolves those two without
// the ancestors and `defaults.style` the rest of the cascade falls to — showing
// an inherited value there would describe a page the engine does not draw.

import type { ReadFn } from '@shojiku/designer-core';
import type { CascadeContext } from '../toolbar/cascade';
import type { EffectiveValue } from '../toolbar/effective';
import { readCharGrid } from './charGrid';
import { CHAR_GRID_OWN_KEYS } from './styleSurfaces';

/** `ctx` cut down to the char_grid's own layers, with no floor either: the
 * panel's hint names an engine default as coming from the document defaults,
 * which a grid never reads, so an unset row shows no hint — the select's
 * 「(default)」 row says the rest (the start of the line; the cell's size). */
export function ownLayersContext(ctx: CascadeContext): CascadeContext {
  return { ...ctx, ancestors: [], defaults: {}, floor: {} };
}

/** The cascade context each of a char_grid's text rows resolves over. */
export function charGridContextFor(ctx: CascadeContext): (key: string) => CascadeContext {
  const own = ownLayersContext(ctx);
  return (key) => (CHAR_GRID_OWN_KEYS.has(key) ? own : ctx);
}

/** What a char_grid's tate-chu-yoko row says it inherits. The grid reads the
 * key through the cascade but combines digit runs only, so an inherited `all`
 * does nothing there and is shown as no hint rather than as a value. */
export function charGridCombineHint(effective: EffectiveValue): EffectiveValue {
  return effective.own === '' && effective.value === 'all'
    ? { ...effective, value: '', cascade: '', origin: 'unset', styleName: '' }
    : effective;
}

/** Whether the char_grid at `path` writes its lines vertically — its own
 * `writingMode` field, not a style key. */
export function charGridVertical(read: ReadFn, path: string): boolean {
  return readCharGrid(read, path).writingMode === 'vertical_rl';
}
