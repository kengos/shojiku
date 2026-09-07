import { Editor } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import type { ItemView } from './itemView';
import {
  applyPanelOp,
  bindingAsText,
  bindingKeyOp,
  bindingPickOps,
  formatOp,
  lengthOp,
  numberOp,
  placeholderOp,
  plainTextOp,
  stepValueOp,
  styleNamesOp,
  switchContentOps,
  textAsBinding,
  toggleStyleName,
} from './model';

describe('stepValueOp', () => {
  it('steps a length value and authors it (unit preserved)', () => {
    expect(stepValueOp('p', ['box', 'x'], '8mm', 1, 8, 'length')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['box', 'x'],
      value: '10.8mm',
    });
  });

  it('steps a bare number as a number', () => {
    expect(stepValueOp('p', ['box', 'x'], '12', -1, 8, 'length')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['box', 'x'],
      value: 4,
    });
  });

  it('steps a number-kind ratio via numberOp', () => {
    expect(stepValueOp('p', ['style', 'lineHeight'], '1.4', 1, 0.1, 'number')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['style', 'lineHeight'],
      value: 1.5,
    });
  });

  it('dispatches nothing for an unsteppable value', () => {
    expect(stepValueOp('p', ['box', 'w'], '50%', 1, 8, 'length')).toBeNull();
  });

  it('dispatches nothing when the step overflows to non-finite', () => {
    expect(stepValueOp('p', ['box', 'x'], '1', 1, 1e308, 'length')).toBeNull();
  });
});

describe('lengthOp', () => {
  it('authors a bare number as a number', () => {
    expect(lengthOp('p', ['box', 'x'], '12')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['box', 'x'],
      value: 12,
    });
  });

  it('authors a unit string as a string', () => {
    expect(lengthOp('p', ['box', 'w'], '50%')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['box', 'w'],
      value: '50%',
    });
  });

  it('clears the key on an empty value', () => {
    expect(lengthOp('p', ['box', 'x'], '  ')).toEqual({
      op: 'removeKey',
      path: 'p',
      keys: ['box', 'x'],
    });
  });
});

describe('numberOp', () => {
  it('authors a finite number', () => {
    expect(numberOp('p', ['style', 'lineHeight'], '1.5')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['style', 'lineHeight'],
      value: 1.5,
    });
  });

  it('clears the key on empty', () => {
    expect(numberOp('p', ['style', 'lineHeight'], '')).toEqual({
      op: 'removeKey',
      path: 'p',
      keys: ['style', 'lineHeight'],
    });
  });

  it('returns null for a non-numeric value (dispatch nothing)', () => {
    expect(numberOp('p', ['style', 'lineHeight'], 'abc')).toBeNull();
  });
});

describe('plainTextOp', () => {
  it('authors a string verbatim without numeric coercion', () => {
    expect(plainTextOp('p', ['text'], '12')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['text'],
      value: '12',
    });
  });

  it('clears the key on empty', () => {
    expect(plainTextOp('p', ['style', 'fontWeight'], '')).toEqual({
      op: 'removeKey',
      path: 'p',
      keys: ['style', 'fontWeight'],
    });
  });
});

describe('bindingKeyOp / formatOp', () => {
  it('keeps an empty data key as an empty-string value', () => {
    expect(bindingKeyOp('p', '')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['data', 'key'],
      value: '',
    });
  });

  it('sets a format name', () => {
    expect(formatOp('p', 'currency')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['data', 'format'],
      value: 'currency',
    });
  });

  it('clears the format on empty', () => {
    expect(formatOp('p', '')).toEqual({ op: 'removeKey', path: 'p', keys: ['data', 'format'] });
  });
});

describe('placeholderOp', () => {
  it('sets the blank-form placeholder', () => {
    expect(placeholderOp('p', '　年　月　日')).toEqual({
      op: 'setScalar',
      path: 'p',
      keys: ['data', 'placeholder'],
      value: '　年　月　日',
    });
  });

  it('clears the placeholder key on empty (only-touched-keys write)', () => {
    expect(placeholderOp('p', '')).toEqual({
      op: 'removeKey',
      path: 'p',
      keys: ['data', 'placeholder'],
    });
  });
});

describe('styleNames editing', () => {
  it('writes a non-empty list as setStrings', () => {
    expect(styleNamesOp('p', ['a', 'b'])).toEqual({
      op: 'setStrings',
      path: 'p',
      keys: ['styleNames'],
      values: ['a', 'b'],
    });
  });

  it('clears an empty selection', () => {
    expect(styleNamesOp('p', [])).toEqual({ op: 'removeKey', path: 'p', keys: ['styleNames'] });
  });

  it('adds a name preserving order and dedupes', () => {
    expect(toggleStyleName(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleStyleName(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
  });

  it('removes a name', () => {
    expect(toggleStyleName(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('switchContentOps', () => {
  const textView: ItemView = {
    type: 'text',
    hasText: true,
    hasData: false,
    hasSpans: false,
    contentMode: 'text',
    text: 'hi',
    dataScope: '',
    dataKey: '',
    format: '',
    placeholder: '',
    pageFormat: '',
    src: '',
    fit: '',
    styleNames: [],
    style: {},
    box: { x: '', y: '', w: '', h: '' },
  };

  it('switches text to data: removes text and seeds an empty binding', () => {
    expect(switchContentOps('p', textView, 'data')).toEqual([
      { op: 'removeKey', path: 'p', keys: ['text'] },
      { op: 'setScalar', path: 'p', keys: ['data', 'key'], value: '' },
    ]);
  });

  it('seeds a binding without a removeKey when no text key is present', () => {
    expect(switchContentOps('p', { ...textView, hasText: false }, 'data')).toEqual([
      { op: 'setScalar', path: 'p', keys: ['data', 'key'], value: '' },
    ]);
  });

  it('switches data to text: removes data and seeds empty text', () => {
    const dataView: ItemView = { ...textView, hasText: false, hasData: true, contentMode: 'data' };
    expect(switchContentOps('p', dataView, 'text')).toEqual([
      { op: 'removeKey', path: 'p', keys: ['data'] },
      { op: 'setScalar', path: 'p', keys: ['text'], value: '' },
    ]);
  });

  it('seeds text without a removeKey when no data key is present', () => {
    expect(switchContentOps('p', { ...textView, hasData: false }, 'text')).toEqual([
      { op: 'setScalar', path: 'p', keys: ['text'], value: '' },
    ]);
  });

  // Both modes can say "this item is that field", so switching between them
  // must not throw the binding away and make the reader re-pick it.
  it('carries a lone expression into the binding, format and all', () => {
    const view = { ...textView, text: '{order.total:symbol}' };
    expect(switchContentOps('p', view, 'data')).toEqual([
      { op: 'removeKey', path: 'p', keys: ['text'] },
      { op: 'setScalar', path: 'p', keys: ['data', 'key'], value: 'order.total' },
      { op: 'setScalar', path: 'p', keys: ['data', 'format'], value: 'symbol' },
    ]);
  });

  it('carries the binding back out as text', () => {
    const dataView: ItemView = {
      ...textView,
      hasText: false,
      hasData: true,
      contentMode: 'data',
      dataKey: 'order.total',
      format: 'symbol',
    };
    expect(switchContentOps('p', dataView, 'text')).toEqual([
      { op: 'removeKey', path: 'p', keys: ['data'] },
      { op: 'setScalar', path: 'p', keys: ['text'], value: '{order.total:symbol}' },
    ]);
  });

  it('seeds the panel’s kept text when the binding itself carries nothing', () => {
    const dataView: ItemView = { ...textView, hasText: false, hasData: true, contentMode: 'data' };
    expect(switchContentOps('p', dataView, 'text', '{customer.name} 様')).toEqual([
      { op: 'removeKey', path: 'p', keys: ['data'] },
      { op: 'setScalar', path: 'p', keys: ['text'], value: '{customer.name} 様' },
    ]);
  });
});

describe('the two content modes over one binding', () => {
  it('reads a lone expression as a binding, with or without a format', () => {
    expect(textAsBinding('{customer.name}')).toEqual({ key: 'customer.name', format: '' });
    expect(textAsBinding('{total:symbol}')).toEqual({ key: 'total', format: 'symbol' });
  });

  it('reads nothing from text no single binding could hold', () => {
    // Mixed text, plain text, and empty: none of them IS one field.
    expect(textAsBinding('{customer.name} 様')).toBeNull();
    expect(textAsBinding('御請求書')).toBeNull();
    expect(textAsBinding('')).toBeNull();
  });

  it('writes a binding back as its interpolation', () => {
    expect(bindingAsText('customer.name', '')).toBe('{customer.name}');
    expect(bindingAsText('total', 'symbol')).toBe('{total:symbol}');
  });

  it('writes nothing for a key the bare grammar cannot spell', () => {
    // A declared name is the chip editor's business; `text:` has no way to
    // reach a key outside the interpolation charset.
    expect(bindingAsText('品名', '')).toBe('');
  });
});

describe('applyPanelOp', () => {
  it('applies a built op and drops a null one', () => {
    const apply = vi.fn();
    const op = { op: 'removeKey', path: undefined, keys: ['k'] } as const;
    applyPanelOp({ apply }, op);
    expect(apply).toHaveBeenCalledWith(op);
    applyPanelOp({ apply }, null);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('bindingPickOps', () => {
  const PATH = 'sections.body.items[0].columns[0].cell.items[0]';
  const read = (node: unknown) => () => node;

  it('authors key AND scope for a document-scope pick', () => {
    expect(bindingPickOps(read({ type: 'text', data: { key: 'old' } }), PATH, 'order.code', true)) //
      .toEqual([
        { op: 'setScalar', path: PATH, keys: ['data', 'key'], value: 'order.code' },
        { op: 'setScalar', path: PATH, keys: ['data', 'scope'], value: 'document' },
      ]);
  });

  it('clears a PRESENT scope on a row-scope pick', () => {
    const node = { type: 'text', data: { key: 'order.code', scope: 'document' } };
    expect(bindingPickOps(read(node), PATH, 'name', false)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['data', 'key'], value: 'name' },
      { op: 'removeKey', path: PATH, keys: ['data', 'scope'] },
    ]);
  });

  it('emits NO removeKey on a row pick when no scope is authored', () => {
    // `removeKey` on an absent key fails `key_not_found`, which would roll the
    // whole batch back — the key edit included.
    expect(bindingPickOps(read({ type: 'text', data: { key: 'x' } }), PATH, 'name', false)).toEqual(
      [{ op: 'setScalar', path: PATH, keys: ['data', 'key'], value: 'name' }],
    );
  });

  it('clears a scope key holding a HOSTILE value (removeKey succeeds on any value)', () => {
    const node = { type: 'text', data: { key: 'x', scope: { evil: true } } };
    expect(bindingPickOps(read(node), PATH, 'name', false)).toHaveLength(2);
  });

  it('treats an unreadable / non-map node as carrying no scope', () => {
    const throws = () => {
      throw new Error('gone');
    };
    expect(bindingPickOps(throws, PATH, 'name', false)).toHaveLength(1);
    expect(bindingPickOps(read(undefined), PATH, 'name', false)).toHaveLength(1);
    expect(bindingPickOps(read({ type: 'text' }), PATH, 'name', false)).toHaveLength(1);
    expect(bindingPickOps(read({ type: 'text', data: 'nope' }), PATH, 'name', false)).toHaveLength(
      1,
    );
  });

  it('never walks the prototype for the scope probe', () => {
    // `data` inherits a `scope` it does not own: the probe must miss, so no
    // `removeKey` is emitted for a key the document does not carry.
    const data = Object.create({ scope: 'document' }) as Record<string, unknown>;
    data.key = 'x';
    expect(bindingPickOps(read({ type: 'text', data }), PATH, 'name', false)).toHaveLength(1);
  });
});

describe('bindingPickOps — applied as ONE undo step', () => {
  const CELL = 'sections.body.items[0].columns[0].cell.items[0]';
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: table',
    '        data: { key: items }',
    '        columns:',
    '          - label: 品名',
    '            cell:',
    '              items:',
    '                - type: text',
    '                  data: { key: name }',
    '',
  ].join('\n');

  it('undo restores the key AND the scope together', () => {
    const session = Editor.create(SOURCE);
    // `Editor.read` is a method over private state, so it is handed over the
    // way the hook does it (`useEditor` wraps it in a bound callback).
    const read = (path: string) => session.read(path);
    expect(session.applyAll(bindingPickOps(read, CELL, 'order.code', true)).ok).toBe(true);
    expect(session.text()).toContain('scope: document');
    expect(session.text()).toContain('order.code');
    // ONE undo takes both back — a pick is one user action, not two.
    session.undo();
    expect(session.text()).toBe(SOURCE);

    // And the reverse direction: going back to a row field drops the scope
    // line, again in a single step.
    session.redo();
    expect(session.applyAll(bindingPickOps(read, CELL, 'name', false)).ok).toBe(true);
    expect(session.text()).not.toContain('scope:');
    expect(session.text()).toContain('key: name');
    session.undo();
    expect(session.text()).toContain('scope: document');
  });
});
