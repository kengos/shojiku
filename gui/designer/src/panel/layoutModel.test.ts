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

  it('yields a slot per child with the authored flexGrow (default 1) and the fixed-width flag', () => {
    const layout = containerLayoutFor(
      container({ direction: 'row' }, [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b', box: { flexGrow: 2 } },
        { type: 'text', text: 'c', box: { w: 120 } },
        'garbage',
      ]),
      PATH,
    );
    expect(layout?.children).toEqual([
      { path: `${PATH}.items[0]`, ratio: '1', fixedWidth: false },
      { path: `${PATH}.items[1]`, ratio: '2', fixedWidth: false },
      { path: `${PATH}.items[2]`, ratio: '1', fixedWidth: true },
      // Hostile entries still yield slots so indices stay true.
      { path: `${PATH}.items[3]`, ratio: '1', fixedWidth: false },
    ]);
  });

  it('shows a non-displayable flexGrow (a map) as the default 1', () => {
    const layout = containerLayoutFor(
      container({ direction: 'row' }, [{ type: 'text', box: { flexGrow: {} } }]),
      PATH,
    );
    expect(layout?.children[0].ratio).toBe('1');
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
