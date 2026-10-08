// The text circle model: reading `mark:` off a text item (absent kept apart from
// unreadable, presence from the shared binding reader) and the builders that
// write it — every presence switch as one batch over a REAL editor (so the
// "unbinding keeps the circle" rule is the document's answer, not the builder's
// intent), and the clearance refusing what the panel will not author.
import { Editor, type Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  clearTextMarkOp,
  DEFAULT_MARK_PADDING,
  MARK_PADDING_PRESETS,
  MAX_PADDING_PT,
  markPaddingOp,
  readTextMark,
  type TextMarkPresence,
  type TextMarkView,
  textMarkPresenceOps,
} from './textMarkModel';

const PATH = 'sections.body.items[0]';
const MARK = `${PATH}.mark`;

function doc(item: string): string {
  return `sections:\n  body:\n    type: flow\n    items:\n      - ${item}\n`;
}

function editorOf(item: string): Editor {
  return Editor.create(doc(item));
}

function view(editor: Editor): TextMarkView {
  return readTextMark((p) => editor.read(p), PATH);
}

function viewOf(item: string): TextMarkView {
  return view(editorOf(item));
}

function batch(editor: Editor, ops: readonly Op[]) {
  expect(ops.length).toBeGreaterThan(0);
  expect(editor.applyAll(ops).ok).toBe(true);
}

describe('readTextMark', () => {
  it('reads no key, and an explicit null, as no circle', () => {
    for (const item of ['{ type: text, text: 猫 }', '{ type: text, text: 猫, mark: null }']) {
      expect(viewOf(item), item).toEqual({
        state: 'absent',
        markPath: MARK,
        presence: 'none',
        padding: '',
        paddingUnreadable: false,
        styleNames: [],
      });
    }
  });

  it('reads a bare map as a circle that always draws', () => {
    expect(viewOf('{ type: text, text: 猫, mark: {} }')).toMatchObject({
      state: 'map',
      presence: 'always',
    });
  });

  it('reads a `data:` map as bound — through the shared binding reader', () => {
    expect(viewOf('{ type: text, text: 猫, mark: { data: { key: pay } } }').presence).toBe('bound');
    // A non-map `data` is no row to edit (the engine's parse error is the report).
    expect(viewOf('{ type: text, text: 猫, mark: { data: 3 } }').presence).toBe('always');
  });

  it('reads any other non-map as unreadable', () => {
    for (const raw of ['yes', '[1, 2]', '3', 'true']) {
      expect(viewOf(`{ type: text, text: 猫, mark: ${raw} }`), raw).toMatchObject({
        state: 'unreadable',
        presence: 'none',
      });
    }
  });

  it('reads the clearance as authored, and flags one it cannot show', () => {
    expect(viewOf('{ type: text, text: 猫, mark: { padding: 4 } }').padding).toBe('4');
    expect(viewOf('{ type: text, text: 猫, mark: { padding: 0.3em } }').padding).toBe('0.3em');
    // An authored negative is shown as itself (so it can be seen and cleared).
    expect(viewOf('{ type: text, text: 猫, mark: { padding: -2 } }').padding).toBe('-2');
    expect(viewOf('{ type: text, text: 猫, mark: { padding: { a: 1 } } }')).toMatchObject({
      padding: '',
      paddingUnreadable: true,
    });
    expect(viewOf('{ type: text, text: 猫, mark: {} }').paddingUnreadable).toBe(false);
    // `null` is serde's `None` — the default, not something broken.
    expect(viewOf('{ type: text, text: 猫, mark: { padding: null } }')).toMatchObject({
      padding: '',
      paddingUnreadable: false,
    });
  });

  it('clips a hostile clearance string for display', () => {
    const long = 'x'.repeat(200);
    const shown = viewOf(`{ type: text, text: 猫, mark: { padding: ${long} } }`).padding;
    expect(shown.length).toBeLessThan(50);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('reads the circle’s own style names, strings only', () => {
    expect(viewOf('{ type: text, text: 猫, mark: { styleNames: [a, 3, b] } }').styleNames).toEqual([
      'a',
      'b',
    ]);
    expect(viewOf('{ type: text, text: 猫, mark: { styleNames: a } }').styleNames).toEqual([]);
  });

  it('reads own keys only', () => {
    const fake = { type: 'text' };
    Object.setPrototypeOf(fake, { mark: { padding: 9 } });
    const read = (p: string) => (p === PATH ? fake : undefined);
    expect(readTextMark(read, PATH).state).toBe('absent');
    // An OWN `__proto__` key (JSON.parse makes one) is data, never a prototype.
    const own = JSON.parse('{"type":"text","mark":{"__proto__":{"padding":9,"styleNames":["x"]}}}');
    const hostile = readTextMark((p: string) => (p === PATH ? own : undefined), PATH);
    expect(hostile).toMatchObject({ state: 'map', padding: '', styleNames: [] });
    // A throwing read degrades to no circle rather than throwing through the panel.
    expect(
      readTextMark(() => {
        throw new Error('boom');
      }, PATH).state,
    ).toBe('absent');
  });
});

describe('textMarkPresenceOps', () => {
  const states: TextMarkPresence[] = ['none', 'always', 'bound'];
  const start: Record<TextMarkPresence, string> = {
    none: '{ type: text, text: 猫 }',
    always: '{ type: text, text: 猫, mark: {} }',
    bound: '{ type: text, text: 猫, mark: { data: { key: pay } } }',
  };

  it('authors nothing for an unchanged pick', () => {
    for (const state of states) {
      expect(textMarkPresenceOps(PATH, viewOf(start[state]), state), state).toEqual([]);
    }
  });

  it('lands on every other state from every state, as one batch', () => {
    for (const from of states) {
      for (const to of states.filter((s) => s !== from)) {
        const editor = editorOf(start[from]);
        batch(editor, textMarkPresenceOps(PATH, view(editor), to));
        expect(view(editor).presence, `${from} → ${to}`).toBe(to);
      }
    }
  });

  it('turns a circle on as a bare map, or bound with no field picked yet', () => {
    expect(textMarkPresenceOps(PATH, viewOf(start.none), 'always')).toEqual([
      { op: 'putValue', path: PATH, keys: ['mark'], value: {} },
    ]);
    expect(textMarkPresenceOps(PATH, viewOf(start.none), 'bound')).toEqual([
      { op: 'putValue', path: PATH, keys: ['mark'], value: { data: { key: '' } } },
    ]);
  });

  it('unbinding keeps the circle: `mark: {}` is what is left', () => {
    const editor = editorOf(start.bound);
    batch(editor, textMarkPresenceOps(PATH, view(editor), 'always'));
    expect(editor.read(MARK)).toEqual({});
  });

  it('binding keeps the clearance and outline already authored', () => {
    const editor = editorOf(
      '{ type: text, text: 猫, mark: { padding: 3, style: { borderWidth: 2 } } }',
    );
    batch(editor, textMarkPresenceOps(PATH, view(editor), 'bound'));
    expect(editor.read(MARK)).toEqual({ padding: 3, style: { borderWidth: 2 }, data: { key: '' } });
  });

  it('turning it off takes the whole mark — undone in one step', () => {
    const editor = editorOf(
      '{ type: text, text: 猫, mark: { data: { key: pay }, padding: 3, style: { borderWidth: 2 } } }',
    );
    const before = editor.text();
    batch(editor, textMarkPresenceOps(PATH, view(editor), 'none'));
    expect(editor.read(PATH)).not.toHaveProperty('mark');
    editor.undo();
    expect(editor.text()).toBe(before);
  });

  it('switches nothing over an unreadable mark (the clear button is the way out)', () => {
    const unreadable = viewOf('{ type: text, text: 猫, mark: yes }');
    for (const state of states) {
      expect(textMarkPresenceOps(PATH, unreadable, state), state).toEqual([]);
    }
    const editor = editorOf('{ type: text, text: 猫, mark: yes }');
    expect(editor.apply(clearTextMarkOp(PATH)).ok).toBe(true);
    expect(editor.read(PATH)).not.toHaveProperty('mark');
  });
});

describe('markPaddingOp', () => {
  const circled = viewOf('{ type: text, text: 猫, mark: {} }');
  const padded = viewOf('{ type: text, text: 猫, mark: { padding: 4 } }');

  it('writes a non-negative bare number as a NUMBER (the pt wire form)', () => {
    expect(markPaddingOp(circled, '4')).toEqual({
      op: 'setScalar',
      path: MARK,
      keys: ['padding'],
      value: 4,
    });
    expect(markPaddingOp(circled, ' 0 ')).toMatchObject({ value: 0 });
    expect(markPaddingOp(circled, '1.5')).toMatchObject({ value: 1.5 });
  });

  it('writes a non-negative length in every unit the engine parses, verbatim', () => {
    for (const entry of ['0.2em', '1.5mm', '50%', '1rem', '2pt', '1cm', '0.5in', '0em']) {
      expect(markPaddingOp(circled, entry), entry).toMatchObject({ value: entry });
    }
  });

  it('writes every offered preset', () => {
    for (const preset of MARK_PADDING_PRESETS) {
      expect(markPaddingOp(circled, preset), preset).not.toBeNull();
    }
    // The default is named by what unset means, not written.
    expect(DEFAULT_MARK_PADDING).toBe('0.4em');
  });

  it('refuses a sign, an unknown unit, a space, and garbage', () => {
    for (const entry of ['-1', '+1', '-0.2em', 'abc', '1px', '1 em', '.5em', 'em', '1e3']) {
      expect(markPaddingOp(circled, entry), entry).toBeNull();
    }
  });

  it('refuses an absolute length the engine would swap for the default', () => {
    expect(markPaddingOp(circled, String(MAX_PADDING_PT))).not.toBeNull();
    for (const entry of [
      String(MAX_PADDING_PT + 1),
      '1000001pt',
      '40000in',
      '400000cm',
      '9999999mm',
    ]) {
      expect(markPaddingOp(circled, entry), entry).toBeNull();
    }
    expect(markPaddingOp(circled, '13888in')).not.toBeNull();
    // Font-relative forms depend on the size, so they are not bounded here.
    expect(markPaddingOp(circled, '99999em')).not.toBeNull();
  });

  it('refuses a hostile paste over the length cap', () => {
    expect(markPaddingOp(circled, `${'1'.repeat(15)}pt`)).toBeNull();
  });

  it('removes an authored or unreadable clearance on empty; authors nothing when there is none', () => {
    expect(markPaddingOp(padded, '')).toEqual({ op: 'removeKey', path: MARK, keys: ['padding'] });
    const unreadable = viewOf('{ type: text, text: 猫, mark: { padding: [1] } }');
    expect(markPaddingOp(unreadable, '  ')).toMatchObject({ op: 'removeKey' });
    expect(markPaddingOp(circled, '')).toBeNull();
  });

  it('authors nothing for an unchanged value', () => {
    expect(markPaddingOp(padded, '4')).toBeNull();
  });

  it('lands on a real editor, and clearing keeps the circle', () => {
    const editor = editorOf('{ type: text, text: 猫, mark: {} }');
    batch(editor, [markPaddingOp(view(editor), '0.3em') as Op]);
    expect(editor.read(MARK)).toEqual({ padding: '0.3em' });
    batch(editor, [markPaddingOp(view(editor), '') as Op]);
    expect(editor.read(MARK)).toEqual({});
  });
});
