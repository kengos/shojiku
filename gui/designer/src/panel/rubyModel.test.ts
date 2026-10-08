// The ruby model: reading `ruby` / `rubySize` off a text item (absent kept apart
// from unreadable, hostile entries keeping every other row's index) and the
// builders that write them — refusing what the engine would skip with a warning,
// and editing one entry without re-printing its siblings.
import { Editor, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  addRubyOp,
  clearRubyOp,
  editRubyOp,
  MAX_RUBY_CHARS,
  MAX_RUBY_ENTRIES,
  type RubyView,
  readRuby,
  removeRubyOp,
  rubyAddable,
  rubySizeOp,
} from './rubyModel';

const PATH = 'sections.body.items[0]';

function over(item: unknown): ReadFn {
  return (path) => (path === PATH ? item : undefined);
}

function view(item: unknown): RubyView {
  return readRuby(over(item), PATH);
}

const TWO = {
  type: 'text',
  ruby: [
    { base: '吾輩', text: 'わがはい' },
    { base: '猫', text: 'ねこ' },
  ],
};

describe('readRuby', () => {
  it('reads an absent list as absent, with no rows', () => {
    expect(view({ type: 'text', text: 'x' })).toEqual({
      state: 'absent',
      rows: [],
      size: '',
      sizeUnreadable: false,
    });
  });

  it('reads every entry as a row, in listed order', () => {
    expect(view(TWO).rows).toEqual([
      { index: 0, base: '吾輩', text: 'わがはい', readable: true },
      { index: 1, base: '猫', text: 'ねこ', readable: true },
    ]);
    expect(view(TWO).state).toBe('list');
  });

  it('reads a present list that is not a list as unreadable, never as absent', () => {
    for (const ruby of ['吾輩', 3, { base: 'a', text: 'b' }, null, true]) {
      expect(view({ type: 'text', ruby }).state, JSON.stringify(ruby)).toBe('unreadable');
    }
  });

  it('keeps a hostile entry as an unreadable row so every later index stays true', () => {
    const rows = view({
      type: 'text',
      ruby: [
        'x',
        null,
        { base: 123, text: 'a' },
        { base: 'a' },
        JSON.parse('{"__proto__": {"base": "p", "text": "q"}}'),
        [{ base: 'a', text: 'b' }],
        // A third key: `RubyPair` is deny_unknown_fields, so the engine rejects it.
        { base: 'a', text: 'b', size: 6 },
        { base: '日', text: 'ひ' },
      ],
    }).rows;
    expect(rows.map((row) => row.readable)).toEqual([...Array(7).fill(false), true]);
    expect(rows[7]).toEqual({ index: 7, base: '日', text: 'ひ', readable: true });
  });

  it('reads the size as written, and a present size that reads as nothing as unreadable', () => {
    expect(view({ type: 'text', rubySize: 6 })).toMatchObject({ size: '6', sizeUnreadable: false });
    expect(view({ type: 'text', rubySize: '2mm' })).toMatchObject({ size: '2mm' });
    for (const rubySize of [{ pt: 6 }, [6], null, '', true]) {
      expect(view({ type: 'text', rubySize }), JSON.stringify(rubySize)).toMatchObject({
        size: '',
        sizeUnreadable: true,
      });
    }
  });

  it('reads an unreadable item as absent', () => {
    expect(view(undefined).state).toBe('absent');
    expect(
      readRuby(() => {
        throw new Error('gone');
      }, PATH).state,
    ).toBe('absent');
  });
});

describe('addRubyOp', () => {
  it('creates the list with the entry when there is none', () => {
    expect(addRubyOp(PATH, view({ type: 'text' }), '猫', 'ねこ')).toEqual({
      op: 'putValue',
      path: PATH,
      keys: ['ruby'],
      value: [{ base: '猫', text: 'ねこ' }],
    });
  });

  it('appends to an existing list, since listed order is the match order', () => {
    expect(addRubyOp(PATH, view(TWO), '吾輩', 'わがはい')).toEqual({
      op: 'insertItem',
      path: `${PATH}.ruby`,
      index: 2,
      value: { base: '吾輩', text: 'わがはい' },
    });
  });

  it('keeps the strings verbatim, spaces included', () => {
    expect(addRubyOp(PATH, view(TWO), ' 猫 ', 'ね こ')).toMatchObject({
      value: { base: ' 猫 ', text: 'ね こ' },
    });
  });

  it('refuses an empty base or reading', () => {
    expect(addRubyOp(PATH, view(TWO), '', 'ねこ')).toBeNull();
    expect(addRubyOp(PATH, view(TWO), '猫', '')).toBeNull();
  });

  it('counts the cap in code points, so a surrogate pair is one character', () => {
    const wide = '𠮷'.repeat(MAX_RUBY_CHARS);
    expect(wide.length).toBe(MAX_RUBY_CHARS * 2);
    expect(addRubyOp(PATH, view(TWO), wide, 'よし')).not.toBeNull();
    expect(addRubyOp(PATH, view(TWO), `${wide}𠮷`, 'よし')).toBeNull();
    expect(addRubyOp(PATH, view(TWO), 'a', 'b'.repeat(MAX_RUBY_CHARS + 1))).toBeNull();
  });

  it('refuses at the list cap and over an unreadable list', () => {
    const full = {
      type: 'text',
      ruby: Array.from({ length: MAX_RUBY_ENTRIES }, () => ({ base: 'a', text: 'b' })),
    };
    expect(rubyAddable(view(full))).toBe(false);
    expect(addRubyOp(PATH, view(full), '猫', 'ねこ')).toBeNull();
    expect(addRubyOp(PATH, view({ type: 'text', ruby: 'x' }), '猫', 'ねこ')).toBeNull();
    expect(rubyAddable(view(TWO))).toBe(true);
  });

  it('inserts into an empty authored list at its start', () => {
    expect(addRubyOp(PATH, view({ type: 'text', ruby: [] }), '猫', 'ねこ')).toMatchObject({
      op: 'insertItem',
      index: 0,
    });
  });
});

describe('editRubyOp', () => {
  const [first] = view(TWO).rows;

  it('sets the one field of the one entry', () => {
    expect(editRubyOp(PATH, first, 'text', 'わがはーい')).toEqual({
      op: 'setScalar',
      path: `${PATH}.ruby[0]`,
      keys: ['text'],
      value: 'わがはーい',
    });
    expect(editRubyOp(PATH, first, 'base', '我輩')).toMatchObject({
      keys: ['base'],
      value: '我輩',
    });
  });

  it('authors nothing for an unchanged, empty or over-long value, or an unreadable entry', () => {
    expect(editRubyOp(PATH, first, 'base', '吾輩')).toBeNull();
    expect(editRubyOp(PATH, first, 'text', '')).toBeNull();
    expect(editRubyOp(PATH, first, 'text', 'あ'.repeat(MAX_RUBY_CHARS + 1))).toBeNull();
    const [bad] = view({ type: 'text', ruby: ['x'] }).rows;
    expect(editRubyOp(PATH, bad, 'base', '猫')).toBeNull();
  });
});

describe('removeRubyOp / clearRubyOp', () => {
  it('removes one entry from a longer list', () => {
    expect(removeRubyOp(PATH, view(TWO), 1)).toEqual({
      op: 'removeItem',
      path: `${PATH}.ruby`,
      index: 1,
    });
  });

  it('takes the key with the last entry, readable or not', () => {
    const last = { op: 'removeKey', path: PATH, keys: ['ruby'] };
    expect(removeRubyOp(PATH, view({ type: 'text', ruby: [{ base: 'a', text: 'b' }] }), 0)).toEqual(
      last,
    );
    expect(removeRubyOp(PATH, view({ type: 'text', ruby: [7] }), 0)).toEqual(last);
    expect(clearRubyOp(PATH)).toEqual(last);
  });
});

describe('rubySizeOp', () => {
  const unset = view({ type: 'text' });
  const six = view({ type: 'text', rubySize: 6 });

  it('writes a bare number as pt and a unit length as typed', () => {
    expect(rubySizeOp(PATH, unset, '6')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['rubySize'],
      value: 6,
    });
    expect(rubySizeOp(PATH, unset, ' 10.5 ')).toMatchObject({ value: 10.5 });
    for (const typed of ['2mm', '0.5cm', '0.1in', '7pt', '0.5em', '0.4rem']) {
      expect(rubySizeOp(PATH, unset, typed), typed).toMatchObject({ value: typed });
    }
  });

  it('refuses a percentage, which the engine reads against the parent width', () => {
    expect(rubySizeOp(PATH, unset, '50%')).toBeNull();
  });

  it('refuses zero, a sign, garbage and a hostile magnitude or paste', () => {
    for (const typed of [
      '0',
      '0mm',
      '-1',
      '-0',
      'abc',
      '6 pt',
      '1e400',
      'Infinity',
      '1'.repeat(17),
    ]) {
      expect(rubySizeOp(PATH, unset, typed), typed).toBeNull();
    }
  });

  it('removes an authored or unreadable size on empty, and authors nothing when unset', () => {
    const remove = { op: 'removeKey', path: PATH, keys: ['rubySize'] };
    expect(rubySizeOp(PATH, six, '')).toEqual(remove);
    expect(rubySizeOp(PATH, view({ type: 'text', rubySize: { pt: 6 } }), ' ')).toEqual(remove);
    expect(rubySizeOp(PATH, unset, '')).toBeNull();
  });

  it('authors nothing for the unchanged value', () => {
    expect(rubySizeOp(PATH, six, '6')).toBeNull();
    expect(rubySizeOp(PATH, view({ type: 'text', rubySize: '50%' }), '50%')).toBeNull();
  });
});

describe('the ruby builders on a real document', () => {
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: 吾輩は猫である',
    '        ruby:',
    '          - base: 吾輩',
    '            text: わがはい',
    '          # the cat',
    '          - base: 猫 # kanji',
    '            text: ねこ',
    '',
  ].join('\n');

  it('edits one entry and leaves the other entry and its comments as written', () => {
    const editor = Editor.create(SOURCE);
    const op = editRubyOp(PATH, view(editor.read(PATH)).rows[0], 'text', 'わがはーい');
    expect(op !== null && editor.apply(op).ok).toBe(true);
    expect(editor.text()).toContain(
      '# the cat\n          - base: 猫 # kanji\n            text: ねこ',
    );
    expect(editor.read(`${PATH}.ruby[0].text`)).toBe('わがはーい');
  });

  it('adds to and removes from the list, and the last removal leaves no key', () => {
    const editor = Editor.create(SOURCE);
    const read: ReadFn = (path) => editor.read(path);
    const add = addRubyOp(PATH, readRuby(read, PATH), '2026', 'にせんにじゅうろく');
    expect(add !== null && editor.apply(add).ok).toBe(true);
    // A digit-only base must stay a STRING (`base: 2026` would fail the parse).
    expect(editor.read(`${PATH}.ruby[2].base`)).toBe('2026');
    for (let left = 3; left > 0; left -= 1) {
      expect(editor.apply(removeRubyOp(PATH, readRuby(read, PATH), 0)).ok).toBe(true);
    }
    expect(editor.text()).not.toContain('ruby');
  });

  it('creates a list on an item that had none', () => {
    const editor = Editor.create(
      'sections:\n  body:\n    type: flow\n    items:\n      - { type: text, text: 猫 }\n',
    );
    const read: ReadFn = (path) => editor.read(path);
    const op = addRubyOp(PATH, readRuby(read, PATH), '猫', 'ねこ');
    expect(op !== null && editor.apply(op).ok).toBe(true);
    expect(readRuby(read, PATH).rows).toEqual([
      { index: 0, base: '猫', text: 'ねこ', readable: true },
    ]);
    // Inside a flow map the new list is flow too, in keeping with its parent.
    expect(editor.text()).toContain(
      '- { type: text, text: 猫, ruby: [ { base: 猫, text: ねこ } ] }',
    );
  });

  it('creates a block list under a block item', () => {
    const editor = Editor.create(
      'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: 猫\n',
    );
    const read: ReadFn = (path) => editor.read(path);
    const op = addRubyOp(PATH, readRuby(read, PATH), '猫', 'ねこ');
    expect(op !== null && editor.apply(op).ok).toBe(true);
    expect(editor.text()).toContain(
      '        text: 猫\n        ruby:\n          - base: 猫\n            text: ねこ\n',
    );
  });
});
