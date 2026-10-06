import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { containerKindLabel, containerLayoutFor, parentContainerOf } from './layoutModel';

/** A read that never leaks the prototype (own-key guard) — the shape the real
 * editor read has (a grammar lookup, not object indexing). */
function reader(map: Record<string, unknown>): ReadFn {
  return (path) => (Object.hasOwn(map, path) ? map[path] : undefined);
}

/** A read that throws — an alias-bomb subtree. */
const throwingRead: ReadFn = () => {
  throw new Error('alias bomb');
};

const PATH = 'sections.body.items[0]';

function container(box: Record<string, unknown>, items: unknown[] = []): ReadFn {
  return reader({ [PATH]: { type: 'container', box, items } });
}

describe('containerLayoutFor', () => {
  it('reads an unset box.type + unset direction as a column (the engine defaults)', () => {
    const layout = containerLayoutFor(container({}), PATH);
    expect(layout).toMatchObject({ mode: 'column', gap: '', alignItems: 'stretch' });
  });

  it('reads direction row as row mode with the authored gap and alignItems', () => {
    const layout = containerLayoutFor(
      container({ direction: 'row', gap: 8, alignItems: 'center' }),
      PATH,
    );
    expect(layout).toMatchObject({ mode: 'row', gap: '8', alignItems: 'center' });
  });

  it('reads box.type grid as grid mode with a clamped column count', () => {
    expect(containerLayoutFor(container({ type: 'grid', columns: 3 }), PATH)).toMatchObject({
      mode: 'grid',
      columns: 3,
    });
    // A track LIST reads as its length; a hostile count clamps to the engine cap.
    expect(
      containerLayoutFor(container({ type: 'grid', columns: ['1fr', 90] }), PATH),
    ).toMatchObject({ columns: 2 });
    expect(containerLayoutFor(container({ type: 'grid', columns: 1e300 }), PATH)).toMatchObject({
      columns: 64,
    });
    expect(containerLayoutFor(container({ type: 'grid', columns: 'x' }), PATH)).toMatchObject({
      columns: null,
    });
    expect(containerLayoutFor(container({ type: 'grid', columns: [] }), PATH)).toMatchObject({
      columns: null,
    });
    expect(
      containerLayoutFor(container({ type: 'grid', columns: Number.NaN }), PATH),
    ).toMatchObject({ columns: null });
    expect(containerLayoutFor(container({ type: 'grid', columns: 0.5 }), PATH)).toMatchObject({
      columns: null,
    });
  });

  it('keeps a garbage alignItems verbatim (no active button) and non-scalars as empty', () => {
    expect(containerLayoutFor(container({ alignItems: 'constructor' }), PATH)?.alignItems).toBe(
      'constructor',
    );
    expect(containerLayoutFor(container({ alignItems: {} }), PATH)?.alignItems).toBe('');
  });

  it('yields a slot per child with the authored flexGrow (empty when unset) and the fixed-size flags', () => {
    const layout = containerLayoutFor(
      container({ direction: 'row' }, [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b', box: { flexGrow: 2 } },
        { type: 'text', text: 'c', box: { w: 120 } },
        { type: 'text', text: 'd', box: { h: 30 } },
        'garbage',
      ]),
      PATH,
    );
    expect(layout?.children).toEqual([
      // An unset weight is NOT shown as a number: the engine's default depends
      // on whether it can measure the child, which the document cannot tell.
      {
        path: `${PATH}.items[0]`,
        ratio: '',
        fixedWidth: false,
        fixedHeight: false,
        flexItem: true,
      },
      {
        path: `${PATH}.items[1]`,
        ratio: '2',
        fixedWidth: false,
        fixedHeight: false,
        flexItem: true,
      },
      { path: `${PATH}.items[2]`, ratio: '', fixedWidth: true, fixedHeight: false, flexItem: true },
      { path: `${PATH}.items[3]`, ratio: '', fixedWidth: false, fixedHeight: true, flexItem: true },
      // Hostile entries still yield slots so indices stay true.
      {
        path: `${PATH}.items[4]`,
        ratio: '',
        fixedWidth: false,
        fixedHeight: false,
        flexItem: false,
      },
    ]);
  });

  it('shows a non-displayable flexGrow (a map) as empty, never as an invented default', () => {
    const layout = containerLayoutFor(
      container({ direction: 'row' }, [{ type: 'text', box: { flexGrow: {} } }]),
      PATH,
    );
    expect(layout?.children[0].ratio).toBe('');
  });

  it('reads justifyContent as the authored value, start when unset, garbage verbatim', () => {
    expect(containerLayoutFor(container({}), PATH)?.justifyContent).toBe('start');
    expect(
      containerLayoutFor(container({ justifyContent: 'space_between' }), PATH)?.justifyContent,
    ).toBe('space_between');
    expect(
      containerLayoutFor(container({ justifyContent: 'constructor' }), PATH)?.justifyContent,
    ).toBe('constructor');
    expect(containerLayoutFor(container({ justifyContent: {} }), PATH)?.justifyContent).toBe('');
  });

  it('reads whether the container authors its own height', () => {
    expect(containerLayoutFor(container({}), PATH)?.hasHeight).toBe(false);
    expect(containerLayoutFor(container({ h: 80 }), PATH)?.hasHeight).toBe(true);
  });

  it('flags a grid column-track LIST, never a count or a flex container', () => {
    expect(
      containerLayoutFor(container({ type: 'grid', columns: ['1fr', 90] }), PATH)?.columnsIsList,
    ).toBe(true);
    expect(containerLayoutFor(container({ type: 'grid', columns: 2 }), PATH)?.columnsIsList).toBe(
      false,
    );
    // A flex container carrying a stray list is not a grid.
    expect(containerLayoutFor(container({ columns: ['1fr'] }), PATH)?.columnsIsList).toBe(false);
  });

  it('reads the split-by-ratio state over the children with no width or position', () => {
    const basis = (items: unknown[]) =>
      containerLayoutFor(container({ direction: 'row' }, items), PATH)?.basis;
    const zero = { type: 'text', box: { flexBasis: 0 } };
    const plain = { type: 'text' };
    expect(basis([zero, zero])).toBe('all');
    expect(basis([plain, plain])).toBe('none');
    expect(basis([zero, plain])).toBe('mixed');
    // A sized or placed child is outside the split, so it never makes a row mixed.
    expect(
      basis([
        zero,
        { type: 'text', box: { w: 40 } },
        { type: 'text', box: { x: 4 } },
        { type: 'text', box: { y: 4 } },
        'garbage',
      ]),
    ).toBe('all');
    // A line takes no part in a split (it has no box on the wire), so it can
    // neither make a row mixed nor be counted as a member.
    const line = { type: 'line', from: { x: 0, y: 0 }, to: { x: 9, y: 0 } };
    expect(basis([zero, line])).toBe('all');
    expect(basis([line])).toBe('empty');
    expect(
      containerLayoutFor(
        container({ direction: 'row' }, [line, { type: 'text' }]),
        PATH,
      )?.children.map((slot) => slot.flexItem),
    ).toEqual([false, true]);
    // `content` is the default basis, not a zero one.
    expect(basis([{ type: 'text', box: { flexBasis: 'content' } }])).toBe('none');
    // Nothing in the split at all.
    expect(basis([{ type: 'text', box: { w: 40 } }])).toBe('empty');
    expect(basis([])).toBe('empty');
  });

  it('returns null for a non-container, an unknown box.type, and a hostile read', () => {
    expect(containerLayoutFor(reader({ [PATH]: { type: 'text' } }), PATH)).toBeNull();
    expect(containerLayoutFor(reader({ [PATH]: 'garbage' }), PATH)).toBeNull();
    expect(containerLayoutFor(reader({}), PATH)).toBeNull();
    expect(containerLayoutFor(container({ type: 'constructor' }), PATH)).toBeNull();
    expect(containerLayoutFor(throwingRead, PATH)).toBeNull();
  });

  it('reads a non-list items key as no slots', () => {
    expect(
      containerLayoutFor(reader({ [PATH]: { type: 'container', items: 'x' } }), PATH)?.children,
    ).toEqual([]);
  });

  it('degrades hostile wire shapes to an inert view, never a throw', () => {
    // A string box reads as an empty box (all defaults).
    expect(
      containerLayoutFor(reader({ [PATH]: { type: 'container', box: 'garbage' } }), PATH),
    ).toMatchObject({ mode: 'column', gap: '', alignItems: 'stretch' });
    // A prototype-name direction is not `row`, so it reads as column.
    expect(containerLayoutFor(container({ direction: 'constructor' }), PATH)?.mode).toBe('column');
    expect(containerLayoutFor(container({ direction: '__proto__' }), PATH)?.mode).toBe('column');
    // A string flexGrow shows verbatim (the engine is the validator); the
    // slot still exists so indices stay true.
    const layout = containerLayoutFor(
      container({ direction: 'row' }, [{ type: 'text', box: { flexGrow: 'x' } }]),
      PATH,
    );
    expect(layout?.children[0]).toEqual({
      path: `${PATH}.items[0]`,
      ratio: 'x',
      fixedWidth: false,
      fixedHeight: false,
      flexItem: true,
    });
  });
});

describe('parentContainerOf', () => {
  const CHILD = `${PATH}.items[1]`;

  it('finds the direct container parent of an items entry', () => {
    const read = reader({ [PATH]: { type: 'container' }, [CHILD]: { type: 'text' } });
    expect(parentContainerOf(read, CHILD)).toBe(PATH);
  });

  it('yields null for a flow-body child (the parent is not a container)', () => {
    const read = reader({ 'sections.body': { type: 'flow' } });
    expect(parentContainerOf(read, PATH)).toBeNull();
  });

  it('yields null for a non-items path, a section root, and a hostile read', () => {
    expect(parentContainerOf(reader({}), 'sections.body')).toBeNull();
    expect(parentContainerOf(reader({}), `${PATH}.columns[0]`)).toBeNull();
    expect(parentContainerOf(throwingRead, CHILD)).toBeNull();
  });

  it('yields null inside a repeat_flow sub-template (the item map is not a container)', () => {
    const rowItem = `${PATH}.item.items[0]`;
    const read = reader({
      [PATH]: { type: 'repeat_flow', data: { key: 'rows' }, item: { items: [{ type: 'text' }] } },
      [`${PATH}.item`]: { items: [{ type: 'text' }] },
      [rowItem]: { type: 'text' },
    });
    expect(parentContainerOf(read, rowItem)).toBeNull();
  });
});

describe('containerKindLabel', () => {
  const t = (key: string, args?: Record<string, string | number>) =>
    args === undefined ? key : `${key}:${JSON.stringify(args)}`;

  it('names a grid with a known column count via the counted key', () => {
    expect(containerKindLabel(t, { mode: 'grid', columns: 3 })).toBe(
      'containerKind.gridN:{"columns":3}',
    );
  });

  it('falls back to the plain kind key for row/column and a countless grid', () => {
    expect(containerKindLabel(t, { mode: 'row', columns: null })).toBe('containerKind.row');
    expect(containerKindLabel(t, { mode: 'grid', columns: null })).toBe('containerKind.grid');
  });
});
