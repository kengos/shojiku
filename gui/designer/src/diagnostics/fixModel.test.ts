import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { ArgValue, Diagnostic } from '../engine/types';
import { fixFor, type ReadNode } from './fixModel';

function diag(
  code: string,
  { path, args = {} }: { path?: string; args?: Record<string, ArgValue> } = {},
): Diagnostic {
  return { severity: 'warning', code, category: 'layout', message: code, args, path };
}

/** A `read` backed by a real Editor, so a fix is proven against the actual CST. */
function editorRead(ed: Editor): ReadNode {
  return (path) => ed.read(path);
}

/** Applies `fixFor` through a real Editor and returns the resulting text plus a
 * one-step-undo probe, so every positive case proves round-trip + single undo. */
function apply(template: string, d: Diagnostic, pick = 0): { text: string; undone: string } {
  const ed = Editor.create(template);
  const candidates = fixFor(d, editorRead(ed));
  if (candidates === null) throw new Error('expected a fix');
  const chosen = candidates[pick];
  if (chosen === undefined) throw new Error(`no candidate at ${pick}`);
  expect(ed.applyAll(chosen.ops).ok).toBe(true);
  const text = ed.text();
  expect(ed.undo()).toBe(true); // ONE undo step reverts the whole batch
  return { text, undone: ed.text() };
}

describe('fixFor — orientation_ignored', () => {
  const T = 'page:\n  width: 200mm\n  height: 100mm\n  orientation: landscape\n';
  it('drops the root page.orientation key (pathless diagnostic)', () => {
    const { text, undone } = apply(T, diag('orientation_ignored'));
    expect(text).not.toContain('orientation');
    expect(text).toContain('width: 200mm');
    expect(undone).toBe(T);
  });
  it('is null when the page carries no orientation', () => {
    const ed = Editor.create('page:\n  width: 200mm\n');
    expect(fixFor(diag('orientation_ignored'), editorRead(ed))).toBeNull();
  });
  it('is null when page is not a map', () => {
    const ed = Editor.create('page: A4\n');
    expect(fixFor(diag('orientation_ignored'), editorRead(ed))).toBeNull();
  });
});

describe('fixFor — ignored_column_key', () => {
  const T =
    'sections:\n  body:\n    items:\n      - type: table\n        columns:\n          - label: A\n            fit: cover\n';
  const D = diag('ignored_column_key', { path: 'sections.body.items[0].columns[0]' });
  it('drops fit on the column', () => {
    const { text, undone } = apply(T, D);
    expect(text).not.toContain('fit:');
    expect(text).toContain('label: A');
    expect(undone).toBe(T);
  });
  it('is null when the column has no fit', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: table\n        columns:\n          - label: A\n',
    );
    expect(fixFor(D, editorRead(ed))).toBeNull();
  });
});

describe('fixFor — layout_key_on_leaf', () => {
  const T =
    'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        box:\n          gap: 4\n          direction: row\n';
  const D = diag('layout_key_on_leaf', { path: 'sections.body.items[0]' });
  it('drops only the present box layout keys', () => {
    const { text, undone } = apply(T, D);
    expect(text).not.toContain('gap:');
    expect(text).not.toContain('direction:');
    expect(text).toContain('text: hi');
    expect(undone).toBe(T);
  });
  it('is null when the box carries no layout keys', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        box:\n          w: 10\n',
    );
    expect(fixFor(D, editorRead(ed))).toBeNull();
  });
});

describe('fixFor — grid_key_ignored (three box locations)', () => {
  const D = diag('grid_key_ignored', { path: 'sections.body.items[0]' });
  it('container: drops grid keys under box', () => {
    const T =
      'sections:\n  body:\n    items:\n      - type: container\n        box:\n          columns: 2\n        items: []\n';
    const { text, undone } = apply(T, D);
    expect(text).not.toContain('columns:');
    expect(undone).toBe(T);
  });
  it('repeat: drops grid keys under cell.box', () => {
    const T =
      'sections:\n  body:\n    items:\n      - type: repeat\n        cell:\n          box:\n            columns: 2\n';
    const { text } = apply(T, D);
    expect(text).not.toContain('columns:');
  });
  it('repeat_flow: drops grid keys under item.box', () => {
    const T =
      'sections:\n  body:\n    items:\n      - type: repeat_flow\n        item:\n          box:\n            rowGap: 3\n';
    const { text } = apply(T, D);
    expect(text).not.toContain('rowGap:');
  });
  it('is null when no box location carries grid keys', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: container\n        items: []\n',
    );
    expect(fixFor(D, editorRead(ed))).toBeNull();
  });
});

describe('fixFor — table_pagination_key_ignored', () => {
  const T =
    'sections:\n  body:\n    items:\n      - type: table\n        autoPageBreak: false\n        repeatHeader: true\n        columns: []\n';
  const D = diag('table_pagination_key_ignored', { path: 'sections.body.items[0]' });
  it('drops the present pagination keys at the item root', () => {
    const { text, undone } = apply(T, D);
    expect(text).not.toContain('autoPageBreak');
    expect(text).not.toContain('repeatHeader');
    expect(text).toContain('columns: []');
    expect(undone).toBe(T);
  });
  it('is null when the table has no pagination keys', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: table\n        columns: []\n',
    );
    expect(fixFor(D, editorRead(ed))).toBeNull();
  });
});

describe('fixFor — ignored style keys (shape + span)', () => {
  it('shape_style_ignored: drops the named inline style keys', () => {
    const T =
      "sections:\n  body:\n    items:\n      - type: rect\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        style:\n          fontSize: 12\n          color: '#000000'\n";
    const D = diag('shape_style_ignored', {
      path: 'sections.body.items[0]',
      args: { item: 'rect', keys: 'fontSize, color' },
    });
    const { text, undone } = apply(T, D);
    expect(text).not.toContain('fontSize');
    expect(text).not.toContain('color');
    expect(undone).toBe(T);
  });
  it('ignored_span_style: drops the named span style keys', () => {
    const T =
      'sections:\n  body:\n    items:\n      - type: text\n        spans:\n          - text: hi\n            style:\n              gap: 2\n';
    const D = diag('ignored_span_style', {
      path: 'sections.body.items[0].spans[0]',
      args: { keys: 'gap' },
    });
    const { text } = apply(T, D);
    expect(text).not.toContain('gap:');
    expect(text).toContain('text: hi');
  });
  it('is null when args.keys is missing or not a string', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: rect\n        style:\n          gap: 2\n',
    );
    const path = 'sections.body.items[0]';
    expect(fixFor(diag('shape_style_ignored', { path }), editorRead(ed))).toBeNull();
    expect(
      fixFor(diag('shape_style_ignored', { path, args: { keys: 7 } }), editorRead(ed)),
    ).toBeNull();
  });
  it('is null when args.keys is empty', () => {
    const ed = Editor.create('sections:\n  body:\n    items:\n      - type: rect\n');
    expect(
      fixFor(
        diag('shape_style_ignored', { path: 'sections.body.items[0]', args: { keys: '' } }),
        editorRead(ed),
      ),
    ).toBeNull();
  });
  it('is null when none of the listed keys are present in style', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: rect\n        style:\n          color: red\n',
    );
    expect(
      fixFor(
        diag('shape_style_ignored', { path: 'sections.body.items[0]', args: { keys: 'gap' } }),
        editorRead(ed),
      ),
    ).toBeNull();
  });
});

describe('fixFor — no fix / hostile input', () => {
  const noop: ReadNode = () => undefined;
  it('is null for an unknown code', () => {
    expect(fixFor(diag('undefined_style_name', { path: 'x' }), noop)).toBeNull();
  });
  it('is null for prototype-pollution code names (Map lookup, not proto walk)', () => {
    for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(fixFor(diag(code, { path: 'x' }), noop)).toBeNull();
    }
  });
  it('is null when a path-carrying fix has no path', () => {
    expect(fixFor(diag('layout_key_on_leaf'), noop)).toBeNull();
  });
  it('does not throw and is null for hostile node shapes at the path', () => {
    for (const node of [['a'], 'str', 42, null, true]) {
      const read: ReadNode = () => node;
      expect(fixFor(diag('layout_key_on_leaf', { path: 'x' }), read)).toBeNull();
    }
  });
  it('is null when a prefix step is a non-map (box is a scalar)', () => {
    const read: ReadNode = () => ({ box: 'A4' });
    expect(fixFor(diag('layout_key_on_leaf', { path: 'x' }), read)).toBeNull();
  });
});

describe('fixFor — unused_binding', () => {
  const T =
    'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        bindings:\n          who: { key: customer.name }\n';

  it('drops the declaration the diagnostic names, leaving the item', () => {
    const { text, undone } = apply(
      T,
      diag('unused_binding', {
        path: 'sections.body.items[0].bindings.who',
        args: { name: 'who' },
      }),
    );
    expect(text).not.toContain('who');
    expect(text).toContain('text: hi');
    expect(undone).toBe(T);
  });

  it('drops a DOTTED declaration name whole, not one dot-segment of it', () => {
    // A binding name may legally contain `.` (the interpolation charset is
    // alphanumerics, `_` and `.`), so deriving the item path by splitting at the
    // last dot would address `…bindings` and remove the wrong thing — or, worse,
    // find `b` absent and silently offer no fix on a real problem.
    const dotted =
      'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        bindings:\n          ? a.b\n          : { key: customer.name }\n';
    const { text } = apply(
      dotted,
      diag('unused_binding', {
        path: 'sections.body.items[0].bindings.a.b',
        args: { name: 'a.b' },
      }),
    );
    expect(text).not.toContain('a.b');
    expect(text).toContain('text: hi');
  });

  it('keeps a SIBLING declaration that is still used', () => {
    const two =
      'sections:\n  body:\n    items:\n      - type: text\n        text: "{used}"\n        bindings:\n          used: { key: a }\n          spare: { key: b }\n';
    const { text } = apply(
      two,
      diag('unused_binding', {
        path: 'sections.body.items[0].bindings.spare',
        args: { name: 'spare' },
      }),
    );
    expect(text).not.toContain('spare');
    expect(text).toContain('used: { key: a }');
  });

  it('is null when the path does not end in the declaration it names', () => {
    const ed = Editor.create(T);
    // A forged or stale path: the derivation must refuse rather than strip a
    // suffix that is not there and address whatever node results.
    for (const path of [
      'sections.body.items[0]',
      'sections.body.items[0].bindings.other',
      '.bindings.who',
    ]) {
      expect(
        fixFor(diag('unused_binding', { path, args: { name: 'who' } }), editorRead(ed)),
        path,
      ).toBeNull();
    }
  });

  it('is null when the diagnostic carries no usable name', () => {
    const ed = Editor.create(T);
    const path = 'sections.body.items[0].bindings.who';
    expect(fixFor(diag('unused_binding', { path }), editorRead(ed))).toBeNull();
    expect(fixFor(diag('unused_binding', { path, args: { name: 7 } }), editorRead(ed))).toBeNull();
    expect(fixFor(diag('unused_binding', { path, args: { name: '' } }), editorRead(ed))).toBeNull();
  });

  it('is null when the declaration is already gone (no dead button)', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n',
    );
    expect(
      fixFor(
        diag('unused_binding', {
          path: 'sections.body.items[0].bindings.who',
          args: { name: 'who' },
        }),
        editorRead(ed),
      ),
    ).toBeNull();
  });
});

describe('fixFor — stale path is refuse-safe (no partial edit)', () => {
  it('an op built then invalidated is rejected, leaving the text byte-exact', () => {
    const T =
      'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        box:\n          gap: 4\n';
    const ed = Editor.create(T);
    const candidates = fixFor(
      diag('layout_key_on_leaf', { path: 'sections.body.items[0]' }),
      editorRead(ed),
    );
    if (candidates === null) throw new Error('expected a fix');
    // The user removes the key first; the stale fix now targets an absent key.
    ed.applyAll([{ op: 'removeKey', path: 'sections.body.items[0]', keys: ['box', 'gap'] }]);
    const before = ed.text();
    expect(ed.applyAll(candidates[0].ops).ok).toBe(false);
    expect(ed.text()).toBe(before); // rolled back, no partial mutation
  });
});

describe('the candidate shape — what makes today\u2019s rows unchanged', () => {
  // The claim behind "one candidate renders exactly as it always did" is a
  // NON-EVENT: a removal that grew a second candidate, or lost its label key,
  // would still pass every case above, since they all read `candidates[0]`.
  const CASES: readonly [string, string, string][] = [
    ['orientation_ignored', 'page:\n  width: 200mm\n  orientation: landscape\n', ''],
    [
      'layout_key_on_leaf',
      'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        box:\n          gap: 4\n',
      'sections.body.items[0]',
    ],
    [
      'unused_binding',
      'sections:\n  body:\n    items:\n      - type: text\n        text: hi\n        bindings:\n          who: { key: a }\n',
      'sections.body.items[0].bindings.who',
    ],
  ];

  it('gives every REMOVAL exactly one candidate, labelled by the action alone', () => {
    for (const [code, template, path] of CASES) {
      const ed = Editor.create(template);
      const candidates = fixFor(
        diag(code, { path: path === '' ? undefined : path, args: { name: 'who' } }),
        editorRead(ed),
      );
      expect(candidates?.length, code).toBe(1);
      expect(candidates?.[0].labelKey, code).toBe('diagnostics.fix');
      // A removal carries no label args: the message already says what goes.
      expect(candidates?.[0].labelArgs, code).toBeUndefined();
    }
  });
});
