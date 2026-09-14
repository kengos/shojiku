// The one answer to "what is current": a readable selection, else the document.

import { describe, expect, it } from 'vitest';
import { readSubject } from './subject';

const READ = (path: string): unknown =>
  path === 'sections.body.items[0]' ? { type: 'text' } : undefined;

describe('readSubject', () => {
  it('is the document (null) when nothing is selected', () => {
    expect(readSubject(READ, null)).toBeNull();
  });

  it('is the selected node, with what it read to, while it exists', () => {
    expect(readSubject(READ, 'sections.body.items[0]')).toEqual({
      path: 'sections.body.items[0]',
      node: { type: 'text' },
    });
  });

  it('is the document when the selected node no longer exists', () => {
    expect(readSubject(READ, 'sections.body.items[7]')).toBeNull();
  });

  it('is the document when the read throws', () => {
    const hostile = (): unknown => {
      throw new Error('alias bomb');
    };
    expect(readSubject(hostile, 'sections.body.items[0]')).toBeNull();
  });
});
