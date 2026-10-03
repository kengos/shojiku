// The definitions edit list under a rename / delete: structural ops first,
// content ops in final names. Pins the two regressions an APPENDED rename would
// have (an add renamed away; a workshop field re-created under its old name),
// the engineer-base rename, the fold of a rename chain, delete-after-rename,
// and that a re-added node inherits nothing from the deleted one.

import { type Op, parseTemplate, readTemplate } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { inferDefinitions } from '../sample/inferStub';
import { applyDefinitionOps, coalesceDefsEdit } from './definitionsEdit';
import { deleteInEdits, renameInEdits } from './defsRestructure';
import { isNodeKeys, isStructural } from './structuralOps';

const BASE = 'type: object\nproperties:\n  a:\n    type: string\n    title: A\n';
const A = ['properties', 'a'];
const B = ['properties', 'b'];
const C = ['properties', 'c'];
const title = (keys: readonly string[], value: string): Op => ({
  op: 'setScalar',
  keys: [...keys, 'title'],
  value,
});

describe('structural ops', () => {
  it('recognises a node path and only a node path', () => {
    expect(isNodeKeys(['properties', 'a'])).toBe(true);
    expect(isNodeKeys(['properties', 't', 'items', 'properties', 'x'])).toBe(true);
    expect(isNodeKeys(['properties', 'properties', 'title'])).toBe(false);
    expect(isNodeKeys(['properties', 'a', 'items'])).toBe(false);
    expect(isNodeKeys(['properties'])).toBe(false);
    expect(isNodeKeys(['title'])).toBe(false);
    expect(isStructural({ op: 'removeKey', keys: ['properties', 'a', 'required'] })).toBe(false);
    expect(isStructural({ op: 'removeKey', path: 'x', keys: A })).toBe(false);
  });

  it('coalescing never drops a structural op (a re-add keeps the removal)', () => {
    const removed: Op[] = [{ op: 'removeKey', keys: A }];
    const put: Op = { op: 'putValue', keys: A, value: { type: 'number' } };
    expect(coalesceDefsEdit(removed, put)).toEqual([...removed, put]);
  });
});

describe('renameInEdits', () => {
  it('renames an engineer-base node with a structural op, re-keying its edits', () => {
    const edits = renameInEdits([title(A, 'X')], BASE, A, 'b');
    expect(edits).toEqual([{ op: 'renameKey', keys: A, to: 'b' }, title(B, 'X')]);
    expect(applyDefinitionOps(BASE, edits)).toBe(
      'type: object\nproperties:\n  b:\n    type: string\n    title: X\n',
    );
  });

  it('renames an ADDED node by re-keying its add (no structural op)', () => {
    const add: Op = { op: 'putValue', keys: B, value: { type: 'string' } };
    const edits = renameInEdits([add, title(B, 'Y')], BASE, B, 'c');
    expect(edits).toEqual([{ ...add, keys: C }, title(C, 'Y')]);
    expect(applyDefinitionOps(BASE, edits)).toContain('  c:\n    type: string\n    title: Y\n');
  });

  it('a workshop rename leaves no node under the old name (the base follows the sample)', () => {
    const edits = renameInEdits([title(A, 'X')], undefined, A, 'b');
    expect(edits).toEqual([title(B, 'X')]);
    // The re-keyed sample infers `b`; the old-name edit would have re-created `a`.
    const stub = inferDefinitions(JSON.stringify({ b: 'v' }));
    const effective = readTemplate(parseTemplate(applyDefinitionOps(stub, edits))) as {
      properties: Record<string, { title?: string }>;
    };
    expect(Object.keys(effective.properties)).toEqual(['b']);
    expect(effective.properties.b?.title).toBe('X');
    // Appended instead, the old-name edit re-creates `a` beside the inferred `b`.
    const appended = readTemplate(parseTemplate(applyDefinitionOps(stub, [title(A, 'X')]))) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(appended.properties)).toEqual(['b', 'a']);
  });

  it('folds a rename chain and drops a rename back to the original', () => {
    const once = renameInEdits([], BASE, A, 'b');
    expect(renameInEdits(once, BASE, B, 'c')).toEqual([{ op: 'renameKey', keys: A, to: 'c' }]);
    expect(renameInEdits(once, BASE, B, 'a')).toEqual([]);
  });

  it('does not fold past a later structural op on the node', () => {
    const base =
      'properties:\n  g:\n    type: object\n    properties:\n      x: { type: string }\n';
    const G = ['properties', 'g'];
    const X = [...G, 'properties', 'x'];
    const renamedChild = renameInEdits([], base, X, 'y');
    const both = renameInEdits(renamedChild, base, G, 'h');
    expect(both).toEqual([
      { op: 'renameKey', keys: X, to: 'y' },
      { op: 'renameKey', keys: G, to: 'h' },
    ]);
    expect(applyDefinitionOps(base, both)).toContain(
      'h:\n    type: object\n    properties:\n      y:',
    );
  });

  it('leaves other nodes’ edits alone', () => {
    const other = title(['properties', 'z'], 'Z');
    expect(renameInEdits([other], BASE, A, 'b')).toEqual([
      { op: 'renameKey', keys: A, to: 'b' },
      other,
    ]);
  });
});

describe('deleteInEdits', () => {
  it('drops the node’s edits and removes a base node structurally', () => {
    expect(deleteInEdits([title(A, 'X')], BASE, A)).toEqual([{ op: 'removeKey', keys: A }]);
  });

  it('removes an added node by dropping its add', () => {
    const add: Op = { op: 'putValue', keys: B, value: { type: 'string' } };
    expect(deleteInEdits([add, title(B, 'Y')], BASE, B)).toEqual([]);
  });

  it('a delete after a rename removes the original', () => {
    const renamed = renameInEdits([], BASE, A, 'b');
    expect(deleteInEdits(renamed, BASE, B)).toEqual([{ op: 'removeKey', keys: A }]);
  });

  it('a re-added node inherits nothing from the deleted one', () => {
    const deleted = deleteInEdits([title(A, 'X')], BASE, A);
    const readd = coalesceDefsEdit(deleted, { op: 'putValue', keys: A, value: { type: 'number' } });
    const effective = applyDefinitionOps(BASE, readd);
    expect(effective).toContain('a:\n    type: number');
    expect(effective).not.toContain('title');
  });

  it('an edit after a rename lands on the renamed node', () => {
    const renamed = renameInEdits([title(A, 'X')], BASE, A, 'b');
    const edited = coalesceDefsEdit(renamed, title(B, 'Y'));
    expect(edited).toEqual([{ op: 'renameKey', keys: A, to: 'b' }, title(B, 'Y')]);
  });
});

describe('the edit list past other structural ops', () => {
  it('appends a base rename after an unrelated removal', () => {
    const base = 'properties:\n  a: { type: string }\n  b: { type: string }\n';
    const removed = deleteInEdits([], base, A);
    expect(renameInEdits(removed, base, B, 'c')).toEqual([
      { op: 'removeKey', keys: A },
      { op: 'renameKey', keys: B, to: 'c' },
    ]);
  });

  it('a node re-added under a name renamed away is an ADD, renamed by re-keying', () => {
    const base =
      'properties:\n  g:\n    type: object\n    properties:\n      x: { type: string }\n';
    const G = ['properties', 'g'];
    const away = renameInEdits([], base, G, 'h');
    const readd: Op[] = [
      ...away,
      { op: 'putValue', keys: [...G, 'properties', 'y'], value: { type: 'string' } },
    ];
    expect(renameInEdits(readd, base, [...G, 'properties', 'y'], 'z')).toEqual([
      { op: 'renameKey', keys: G, to: 'h' },
      { op: 'putValue', keys: [...G, 'properties', 'z'], value: { type: 'string' } },
    ]);
  });
});

describe('a name swap through the edit list', () => {
  it('does not fold a rename in front of the op that frees its name (A→B, C→A, B→C)', () => {
    const base = 'properties:\n  a: { type: string, title: A }\n  c: { type: number, title: C }\n';
    const C2 = ['properties', 'c'];
    let edits = renameInEdits([], base, A, 'b');
    edits = renameInEdits(edits, base, C2, 'a');
    edits = renameInEdits(edits, base, B, 'c');
    expect(edits).toEqual([
      { op: 'renameKey', keys: A, to: 'b' },
      { op: 'renameKey', keys: C2, to: 'a' },
      { op: 'renameKey', keys: B, to: 'c' },
    ]);
    const swapped = readTemplate(parseTemplate(applyDefinitionOps(base, edits))) as {
      properties: Record<string, { title: string }>;
    };
    expect(swapped.properties.a?.title).toBe('C');
    expect(swapped.properties.c?.title).toBe('A');
  });

  it('an edit addressed to the OLD path after a rename leaves the renamed node alone', () => {
    const renamed = renameInEdits([title(A, 'X')], BASE, A, 'b');
    const stale = coalesceDefsEdit(renamed, title(A, 'stale'));
    expect(stale.slice(0, 2)).toEqual(renamed);
    const effective = readTemplate(parseTemplate(applyDefinitionOps(BASE, stale))) as {
      properties: Record<string, { title?: string }>;
    };
    expect(effective.properties.b?.title).toBe('X');
  });
});

describe('folding past an unrelated removal', () => {
  it('still folds a rename chain when a later op only removes another node', () => {
    const base = 'properties:\n  a: { type: string }\n  z: { type: string }\n';
    const Z = ['properties', 'z'];
    let edits = renameInEdits([], base, A, 'b');
    edits = deleteInEdits(edits, base, Z);
    expect(renameInEdits(edits, base, B, 'c')).toEqual([
      { op: 'renameKey', keys: A, to: 'c' },
      { op: 'removeKey', keys: Z },
    ]);
  });
});
