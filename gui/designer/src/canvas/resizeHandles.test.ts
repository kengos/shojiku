import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { HANDLES, handleKeys, resizableHandle } from './resizeHandles';

/** A read function over exact-path entries (unknown paths read undefined —
 * the materializer's miss shape). */
const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

describe('handleKeys / resizableHandle', () => {
  it('maps every handle to its touched keys', () => {
    expect(handleKeys('nw')).toEqual(['x', 'w', 'y', 'h']);
    expect(handleKeys('n')).toEqual(['y', 'h']);
    expect(handleKeys('ne')).toEqual(['w', 'y', 'h']);
    expect(handleKeys('e')).toEqual(['w']);
    expect(handleKeys('se')).toEqual(['w', 'h']);
    expect(handleKeys('s')).toEqual(['h']);
    expect(handleKeys('sw')).toEqual(['x', 'w', 'h']);
    expect(handleKeys('w')).toEqual(['x', 'w']);
  });

  it('refuses only the handles touching a relative-authored key', () => {
    const read = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', box: { x: 0, y: 18, w: '100%', h: 16 } },
    });
    const usable = HANDLES.filter((h) => resizableHandle(read, 'sections.body.items[0]', h));
    expect(usable).toEqual(['n', 's']);
  });

  it('treats absent keys as writable and a read throw as not resizable', () => {
    const read = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect' },
    });
    expect(resizableHandle(read, 'sections.body.items[0]', 'se')).toBe(true);
    const bomb: ReadFn = () => {
      throw new Error('bomb');
    };
    expect(resizableHandle(bomb, 'sections.body.items[0]', 'se')).toBe(false);
  });
});
