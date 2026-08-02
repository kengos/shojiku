import { describe, expect, it } from 'vitest';
import { formatPath, type PathSegment, PathSyntaxError, parsePath, toYamlPath } from './path';

describe('parsePath', () => {
  it('parses a chain of keys and sequence indices', () => {
    expect(parsePath('sections.body.items[3].items[0]')).toEqual<PathSegment[]>([
      { kind: 'key', key: 'sections' },
      { kind: 'key', key: 'body' },
      { kind: 'key', key: 'items' },
      { kind: 'index', index: 3 },
      { kind: 'key', key: 'items' },
      { kind: 'index', index: 0 },
    ]);
  });

  it('parses a key with no index', () => {
    expect(parsePath('defaults')).toEqual<PathSegment[]>([{ kind: 'key', key: 'defaults' }]);
  });

  it('parses consecutive indices on one key', () => {
    expect(parsePath('grid[1][2]')).toEqual<PathSegment[]>([
      { kind: 'key', key: 'grid' },
      { kind: 'index', index: 1 },
      { kind: 'index', index: 2 },
    ]);
  });

  it('rejects an empty path', () => {
    expect(() => parsePath('')).toThrow(PathSyntaxError);
  });

  it('rejects a segment that is not an identifier', () => {
    expect(() => parsePath('sections.[0]')).toThrow(PathSyntaxError);
  });
});

describe('formatPath', () => {
  it('round-trips a mixed key/index path', () => {
    const input = 'sections.items[0].body';
    expect(formatPath(parsePath(input))).toBe(input);
  });

  it('renders a leading index without a dot', () => {
    expect(formatPath([{ kind: 'index', index: 2 }])).toBe('[2]');
  });
});

describe('toYamlPath', () => {
  it('maps keys to strings and indices to numbers', () => {
    expect(toYamlPath(parsePath('sections.body.items[3]'))).toEqual([
      'sections',
      'body',
      'items',
      3,
    ]);
  });
});
