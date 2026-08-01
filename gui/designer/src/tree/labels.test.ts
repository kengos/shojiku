import { describe, expect, it } from 'vitest';
import { kindName, nodeLabel } from './labels';

/** The chrome lookup stub: echoes the key so tests assert key routing. */
const t = (key: string) => key;

describe('kindName', () => {
  it('routes sections to the section keys', () => {
    expect(kindName('section:header', t)).toBe('tree.section.header');
    expect(kindName('section:footer', t)).toBe('tree.section.footer');
  });

  it('routes known kinds to their chrome keys', () => {
    expect(kindName('text', t)).toBe('tree.type.text');
    expect(kindName('repeat_flow', t)).toBe('tree.type.repeat_flow');
    expect(kindName('column', t)).toBe('tree.type.column');
    expect(kindName('header_group', t)).toBe('tree.type.header_group');
    expect(kindName('item', t)).toBe('tree.type.item');
  });

  it('shows an unknown wire type verbatim', () => {
    expect(kindName('hologram', t)).toBe('hologram');
  });
});

describe('nodeLabel', () => {
  it('prefers the content-derived label and falls back to the kind name', () => {
    const base = { path: 'p', children: [] } as const;
    expect(nodeLabel({ ...base, kind: 'text', label: 'Hello' }, t)).toBe('Hello');
    expect(nodeLabel({ ...base, kind: 'text', label: null }, t)).toBe('tree.type.text');
  });
});
