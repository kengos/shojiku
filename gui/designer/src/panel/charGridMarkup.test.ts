// The content-interpretation switch's model. `markup` has ONE legal value on the
// wire, so every case here is about the two states the key can be in and about the
// values that are neither.

import { describe, expect, it } from 'vitest';
import { CHAR_GRID_MARKUP_CAPABILITY, markupOp, readCharGridMarkup } from './charGridMarkup';

const P = 'sections.body.items[0]';
const read = (node: unknown) => (path: string) => (path === P ? node : undefined);

describe('readCharGridMarkup', () => {
  it('is ON for the one spelling the engine has', () => {
    expect(readCharGridMarkup(read({ type: 'char_grid', markup: 'aozora' }), P)).toBe(true);
  });

  it('is OFF when the key is absent — which is how verbatim is spelled', () => {
    expect(readCharGridMarkup(read({ type: 'char_grid' }), P)).toBe(false);
  });

  it('is OFF for a markup value this Designer does not know', () => {
    // A newer engine could add a grammar. Rendering a half-on toggle for it would
    // invite an author to "turn off" something the toggle cannot express, and the
    // off path would then silently delete a key the document meant.
    expect(readCharGridMarkup(read({ type: 'char_grid', markup: 'markdown' }), P)).toBe(false);
  });

  it('is OFF for a hostile shape rather than throwing', () => {
    expect(readCharGridMarkup(read({ type: 'char_grid', markup: { on: true } }), P)).toBe(false);
    expect(readCharGridMarkup(read('not a map'), P)).toBe(false);
    expect(readCharGridMarkup(read(undefined), P)).toBe(false);
  });
});

describe('markupOp', () => {
  it('authors the single legal value when turned on', () => {
    expect(markupOp(P, true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['markup'],
      value: 'aozora',
    });
  });

  it('REMOVES the key when turned off — there is no `none` to author', () => {
    // `Markup` has one variant. Writing `markup: none` would be a value the engine
    // rejects, and a template that no longer parses.
    expect(markupOp(P, false)).toEqual({ op: 'removeKey', path: P, keys: ['markup'] });
  });
});

describe('the capability key', () => {
  it("is the engine's own spelling, not one invented here", () => {
    // `engine/authoring/src/capabilities/list/items.rs:54`. A key the GUI made up
    // would gate on nothing and the control would show against an engine that
    // rejects the value.
    expect(CHAR_GRID_MARKUP_CAPABILITY).toBe('char_grid.markup.aozora');
  });
});
