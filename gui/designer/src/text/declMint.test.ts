// Tests for declMint.ts — minting a fresh binding name (the whole-namespace
// taken set: declared + pending + other surfaces) and the chip-insert plan.
import { describe, expect, it } from 'vitest';
import { type InsertContext, mintDeclName, planChipInsert } from './declMint';
import type { Declaration, PendingDecl } from './declModel';

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

describe('mintDeclName', () => {
  it('keeps the key itself when it already spells a free name', () => {
    expect(mintDeclName('order_code', new Set())).toEqual({
      name: 'order_code',
      wire: '{order_code}',
    });
  });

  it('strips the characters an interpolation name cannot carry', () => {
    // The hyphen is outside the engine's `[A-Za-z0-9_.]`, so the whole key
    // cannot be written as `{order-code}` — the stripped spelling can.
    expect(mintDeclName('order-code', new Set()).name).toBe('ordercode');
  });

  it('numbers the stem when the stripped spelling is taken', () => {
    expect(mintDeclName('order-code', new Set(['ordercode'])).name).toBe('ordercode1');
  });

  it('falls back to the default stem when the key strips to nothing', () => {
    expect(mintDeclName('品名', new Set())).toEqual({ name: 'f1', wire: '{f1}' });
  });

  it('walks past every taken stem number', () => {
    expect(mintDeclName('品名', new Set(['f1', 'f2'])).name).toBe('f3');
  });

  it('never opens an invented name with a digit or a dot', () => {
    // `1`/`.5` would resolve as a non-string scalar once the name becomes a
    // YAML map key, so a name we invent starts with a letter or underscore.
    expect(mintDeclName('項目1', new Set()).name).toBe('f1');
    expect(mintDeclName('.5割', new Set()).name).toBe('f1');
  });

  it('treats prototype-shaped names as ordinary taken strings', () => {
    // The taken set is a real Set, so `__proto__` neither walks a prototype
    // nor silently reads as free.
    expect(mintDeclName('__proto__', new Set(['__proto__'])).name).toBe('__proto__1');
    expect(mintDeclName('constructor!', new Set()).name).toBe('constructor');
  });

  it('drops an astral character whole', () => {
    expect(mintDeclName('a😀b', new Set()).name).toBe('ab');
  });
});

describe('planChipInsert', () => {
  it('writes no declaration when the bare grammar already says it', () => {
    expect(planChipInsert('total', false, insertContext())).toEqual({
      wire: '{total}',
      name: 'total',
      decl: null,
    });
  });

  it('declares a key the interpolation charset cannot spell', () => {
    const plan = planChipInsert('品名', false, insertContext({ offeredKeys: ['品名'] }));
    expect(plan).toEqual({
      wire: '{f1}',
      name: 'f1',
      decl: { name: 'f1', key: '品名', scope: null },
    });
  });

  it('declares a document-scope pick made inside a row scope', () => {
    const plan = planChipInsert(
      'store_name',
      true,
      insertContext({ scope: 'items', offeredKeys: ['store_name'] }),
    );
    expect(plan.decl).toEqual({ name: 'store_name1', key: 'store_name', scope: 'document' });
    expect(plan.wire).toBe('{store_name1}');
  });

  it('leaves a document-scope pick bare outside a row scope', () => {
    // `scope: document` is inert there, so the declaration would say nothing.
    expect(planChipInsert('store_name', true, insertContext()).decl).toBeNull();
  });

  it('reuses a declaration that already means exactly this', () => {
    const ctx = insertContext({
      scope: 'items',
      declared: declared({ shop: { key: 'store_name', scope: 'document' } }),
    });
    expect(planChipInsert('store_name', true, ctx)).toEqual({
      wire: '{shop}',
      name: 'shop',
      decl: null,
    });
  });

  it('reuses a name staged earlier in the same session', () => {
    const ctx = insertContext({
      pending: [{ name: 'f1', key: '品名', scope: null }],
    });
    expect(planChipInsert('品名', false, ctx)).toEqual({
      wire: '{f1}',
      name: 'f1',
      decl: null,
    });
  });

  it('mints past a declaration whose name could never be referenced', () => {
    // The engine reports such a name as `invalid_binding_name`; writing
    // `{品 名}` would print literal braces, so a fresh name is the repair.
    const ctx = insertContext({ declared: declared({ '品 名': { key: '品名', scope: null } }) });
    expect(planChipInsert('品名', false, ctx).decl).toEqual({
      name: 'f1',
      key: '品名',
      scope: null,
    });
  });

  it('mints past a declaration for a different key or scope', () => {
    const ctx = insertContext({
      scope: 'items',
      declared: declared({ shop: { key: 'store_name', scope: null } }),
      offeredKeys: ['store_name'],
    });
    expect(planChipInsert('store_name', true, ctx).decl).toEqual({
      name: 'store_name1',
      key: 'store_name',
      scope: 'document',
    });
  });

  it('never mints a name another surface of the item already interpolates', () => {
    // One declaration map serves the item's `text:`, its `link.url` AND its
    // spans, so minting `f1` here would silently redirect a `{f1}` in the URL
    // to this field.
    const ctx = insertContext({ otherNames: ['f1', 'f2'] });
    expect(planChipInsert('品名', false, ctx).decl?.name).toBe('f3');
  });

  it('never shadows a name the text, the offered fields or a staged pick own', () => {
    const ctx = insertContext({
      declared: declared({ f1: { key: 'other', scope: null } }),
      pending: [{ name: 'f2', key: 'other2', scope: null }],
      text: '{f3}',
      offeredKeys: ['f4'],
    });
    expect(planChipInsert('品名', false, ctx).decl?.name).toBe('f5');
  });
});
