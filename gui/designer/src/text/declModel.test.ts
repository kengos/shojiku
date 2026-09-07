import { Editor, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { commitOps } from './declCommit';
import { type InsertContext, planChipInsert } from './declMint';
import {
  chipMetaFor,
  type Declaration,
  linkSurfaceNames,
  narrowDeclarations,
  otherSurfaceNames,
  type PendingDecl,
  readDeclarations,
  spanLinkSurfaceNames,
} from './declModel';

/** A read function over a flat path → materialized-value table. */
function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const THROWS: ReadFn = () => {
  throw new Error('unreadable');
};

const ITEM = 'sections.body.items[0]';

function declared(entries: Record<string, Declaration>): ReadonlyMap<string, Declaration> {
  return new Map(Object.entries(entries));
}

function insertContext(over: Partial<InsertContext> = {}): InsertContext {
  return {
    scope: null,
    declared: new Map<string, Declaration>(),
    pending: [] as readonly PendingDecl[],
    text: '',
    offeredKeys: [] as readonly string[],
    otherNames: [] as readonly string[],
    ...over,
  };
}

describe('narrowDeclarations', () => {
  it('reads key and scope, defaulting an absent or garbage scope to ambient', () => {
    const map = narrowDeclarations({
      a: { key: '品名' },
      b: { key: 'store', scope: 'document' },
      c: { key: 'x', scope: 'element' },
      d: { key: 'y', scope: 7 },
    });
    expect(map.get('a')).toEqual({ key: '品名', scope: null });
    expect(map.get('b')).toEqual({ key: 'store', scope: 'document' });
    expect(map.get('c')).toEqual({ key: 'x', scope: null });
    expect(map.get('d')).toEqual({ key: 'y', scope: null });
  });

  it('degrades on anything that is not a map of keyed declarations', () => {
    expect(narrowDeclarations(undefined).size).toBe(0);
    expect(narrowDeclarations('bindings').size).toBe(0);
    expect(narrowDeclarations([{ key: 'a' }]).size).toBe(0);
    const map = narrowDeclarations({ a: 'plain', b: { key: 7 }, c: { key: '' }, d: null });
    expect(map.size).toBe(0);
  });

  it('holds a prototype-shaped declaration name as inert data', () => {
    // Built from LITERAL YAML: an object literal `{ __proto__: … }` in a test
    // would set the prototype and exercise nothing.
    const editor = Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: "{__proto__}"',
        '        bindings:',
        '          __proto__: { key: 品名 }',
        '',
      ].join('\n'),
    );
    const map = readDeclarations((path) => editor.read(path), ITEM);
    expect(map.get('__proto__')).toEqual({ key: '品名', scope: null });
    expect(({} as Record<string, unknown>).key).toBeUndefined();
  });
});

describe('prototype-shaped names and keys stay inert data', () => {
  // Declaration names AND params keys are attacker strings, so every lookup
  // here goes through a real Map/Set. A plain-object table would answer
  // `constructor`/`toString` from the prototype.
  const PROTO_NAMES = ['__proto__', 'constructor', 'toString'] as const;

  it('reads each prototype-shaped NAME as an ordinary declaration', () => {
    const map = narrowDeclarations(
      // A LITERAL JSON text: an object literal `{ __proto__: … }` would set
      // the prototype and the test would exercise nothing.
      JSON.parse('{"__proto__":{"key":"a"},"constructor":{"key":"b"},"toString":{"key":"c"}}'),
    );
    expect([...map.keys()].sort()).toEqual(['__proto__', 'constructor', 'toString']);
    expect(map.get('toString')).toEqual({ key: 'c', scope: null });
  });

  it('never answers an undeclared prototype name from the prototype', () => {
    const map = narrowDeclarations({ a: { key: 'x' } });
    for (const name of PROTO_NAMES) {
      expect(map.get(name)).toBeUndefined();
    }
    const meta = chipMetaFor([{ key: 'a', label: 'A', sample: '' }], [], map);
    for (const name of PROTO_NAMES) {
      expect(meta.get(name)).toBeUndefined();
    }
  });

  it('plans and commits a declaration whose KEY is prototype-shaped', () => {
    for (const key of PROTO_NAMES) {
      const plan = planChipInsert(key, true, insertContext({ scope: 'items', offeredKeys: [key] }));
      expect(plan.decl).toEqual({ name: `${key}1`, key, scope: 'document' });
      const ops = commitOps({
        read: readOf({ [ITEM]: { type: 'text', text: '' } }),
        path: ITEM,
        oldText: '',
        newText: plan.wire,
        pending: plan.decl === null ? [] : [plan.decl],
      });
      expect(ops[1]).toEqual({
        op: 'putValue',
        path: ITEM,
        keys: ['bindings', `${key}1`],
        value: { key, scope: 'document' },
      });
    }
    // Nothing leaked onto Object.prototype along the way.
    expect(({} as Record<string, unknown>).key).toBeUndefined();
  });
});

describe('readDeclarations', () => {
  it('reads the item’s own map', () => {
    const read = readOf({ [ITEM]: { type: 'text', bindings: { a: { key: 'x' } } } });
    expect(readDeclarations(read, ITEM).get('a')).toEqual({ key: 'x', scope: null });
  });

  it('reads empty from a missing, bindings-less or unreadable item', () => {
    expect(readDeclarations(readOf({}), ITEM).size).toBe(0);
    expect(readDeclarations(readOf({ [ITEM]: { type: 'text' } }), ITEM).size).toBe(0);
    expect(readDeclarations(THROWS, ITEM).size).toBe(0);
  });
});

describe('otherSurfaceNames', () => {
  it('collects every interpolating surface except the item’s own text', () => {
    const names = otherSurfaceNames({
      type: 'text',
      text: '{owntext}',
      link: { url: 'https://x/{linked}' },
      spans: [{ text: '{spantext}' }, { link: { url: '/{spanlink}' } }, 'junk', null],
    });
    expect([...names].sort()).toEqual(['linked', 'spanlink', 'spantext']);
  });

  it('degrades on hostile shapes', () => {
    expect(otherSurfaceNames(undefined).size).toBe(0);
    expect(otherSurfaceNames('text').size).toBe(0);
    expect(otherSurfaceNames({ link: 'https://x/{a}', spans: 'nope' }).size).toBe(0);
  });
});

describe('linkSurfaceNames', () => {
  it('collects every interpolating surface except the item’s own link URL', () => {
    // The MIRROR of `otherSurfaceNames`, one surface over. Same fixture, and
    // the two results must be disjoint on the item's own two surfaces: each
    // omits the one being edited, because the commit compares that directly.
    const item = {
      type: 'text',
      text: '{owntext}',
      link: { url: 'https://x/{linked}' },
      spans: [{ text: '{spantext}' }, { link: { url: '/{spanlink}' } }, 'junk', null],
    };
    expect([...linkSurfaceNames(item)].sort()).toEqual(['owntext', 'spanlink', 'spantext']);
    expect(linkSurfaceNames(item).has('linked')).toBe(false);
    expect(otherSurfaceNames(item).has('owntext')).toBe(false);
  });

  it('degrades on hostile shapes', () => {
    expect(linkSurfaceNames(undefined).size).toBe(0);
    expect(linkSurfaceNames('text').size).toBe(0);
    expect(linkSurfaceNames({ text: 5, spans: 'nope' }).size).toBe(0);
    expect(linkSurfaceNames({ spans: [7, null, { text: 9 }] }).size).toBe(0);
  });
});

describe('spanLinkSurfaceNames', () => {
  const item = {
    type: 'text',
    text: '{owntext}',
    link: { url: 'https://x/{itemlink}' },
    spans: [
      { text: '{span0text}', link: { url: '/{span0link}' } },
      { text: '{span1text}', link: { url: '/{span1link}' } },
      'junk',
      null,
    ],
  };

  it('collects the item’s text, the item’s OWN link, and every fragment', () => {
    // The item's own `link.url` is the half `linkSurfaceNames` omits, and it is
    // exactly what a mint here must not take: one `bindings:` map serves every
    // surface, so taking it would silently redirect the item-level link.
    expect([...spanLinkSurfaceNames(item, 0)].sort()).toEqual([
      'itemlink',
      'owntext',
      'span0text',
      'span1link',
      'span1text',
    ]);
    expect(linkSurfaceNames(item).has('itemlink')).toBe(false);
  });

  it('excludes only the EDITED fragment’s link URL', () => {
    expect(spanLinkSurfaceNames(item, 0).has('span0link')).toBe(false);
    expect(spanLinkSurfaceNames(item, 1).has('span1link')).toBe(false);
    // …and each still holds the other fragment's, so neither can be redirected.
    expect(spanLinkSurfaceNames(item, 0).has('span1link')).toBe(true);
    expect(spanLinkSurfaceNames(item, 1).has('span0link')).toBe(true);
  });

  it('keeps the edited fragment’s own TEXT', () => {
    // A link edit must not prune a declaration the same fragment's text uses —
    // only its own link URL is compared directly by the commit.
    expect(spanLinkSurfaceNames(item, 0).has('span0text')).toBe(true);
  });

  it('is UNCAPPED, so a name held past the display cap is still reserved', () => {
    const spans = Array.from({ length: 400 }, (_, i) => ({ text: `{f${i}}` }));
    expect(spanLinkSurfaceNames({ spans }, 0).has('f399')).toBe(true);
  });

  it('degrades on hostile shapes', () => {
    expect(spanLinkSurfaceNames(undefined, 0).size).toBe(0);
    expect(spanLinkSurfaceNames('text', 0).size).toBe(0);
    expect(spanLinkSurfaceNames({ text: 5, link: 'x', spans: 'nope' }, 0).size).toBe(0);
  });
});

describe('chipMetaFor', () => {
  const rows = [{ key: '品名', label: '品名ラベル', sample: 'みかん' }];
  const documentRows = [{ key: 'store', label: '店舗名', sample: '青山店' }];

  it('labels a declared name through its own scope’s field', () => {
    const meta = chipMetaFor(
      rows,
      documentRows,
      declared({
        f1: { key: '品名', scope: null },
        code: { key: 'store', scope: 'document' },
      }),
    );
    expect(meta.get('f1')).toEqual({ label: '品名ラベル', sample: 'みかん' });
    expect(meta.get('code')).toEqual({ label: '店舗名', sample: '青山店' });
  });

  it('shows the KEY when the declaration points at no offered field', () => {
    const meta = chipMetaFor(rows, documentRows, declared({ f1: { key: 'gone', scope: null } }));
    expect(meta.get('f1')).toEqual({ label: 'gone', sample: '' });
  });

  it('lets a declaration win over an ambient field of the same name', () => {
    const meta = chipMetaFor(
      [...rows, { key: 'total', label: 'Total', sample: '10' }],
      documentRows,
      declared({ total: { key: 'store', scope: 'document' } }),
    );
    expect(meta.get('total')).toEqual({ label: '店舗名', sample: '青山店' });
  });

  it('keeps undeclared rows keyed by their own key', () => {
    const meta = chipMetaFor(rows, documentRows, new Map());
    expect(meta.get('品名')).toEqual({ label: '品名ラベル', sample: 'みかん' });
  });
});
