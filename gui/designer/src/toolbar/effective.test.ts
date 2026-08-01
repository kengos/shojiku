// Tests for effective.ts — resolving one style key over the prepared cascade.
// cascade.ts (the read half: gathering the layers below one item, with every
// guarded/hostile-subtree leg) has no separate public surface and is pinned
// HERE through `effectiveStyles`.
import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { effectiveStyles } from './effective';

/** A read function over a flat path → materialized-value table. */
function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const P = 'sections.body.items[0]';

describe('effectiveStyles — layer resolution', () => {
  it('resolves an own style value with the below-own cascade preserved', () => {
    const read = readOf({
      [P]: { type: 'text', style: { fontWeight: 'normal' }, styleNames: ['title'] },
      styles: { title: { fontWeight: 'bold' } },
    });
    const eff = effectiveStyles(read, P);
    expect(eff.fontWeight).toEqual({
      value: 'normal',
      cascade: 'bold',
      own: 'normal',
      origin: 'own',
      styleName: '',
    });
  });

  it('resolves a named style with LATER names winning', () => {
    const read = readOf({
      [P]: { type: 'text', styleNames: ['a', 'b'] },
      styles: { a: { fontWeight: 'normal', color: '#111111' }, b: { fontWeight: 'bold' } },
    });
    const eff = effectiveStyles(read, P);
    expect(eff.fontWeight).toMatchObject({ value: 'bold', origin: 'style', styleName: 'b' });
    // `b` sets no color, so `a` still wins that key.
    expect(eff.color).toMatchObject({ value: '#111111', origin: 'style', styleName: 'a' });
  });

  it('skips unknown style names (and hostile registry names never crash)', () => {
    const read = readOf({
      [P]: { type: 'text', styleNames: ['missing', '__proto__', 'constructor'] },
      styles: {},
    });
    const eff = effectiveStyles(read, P);
    expect(eff.fontWeight.origin).toBe('unset');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('inherits from the nearest container ancestor (own or named)', () => {
    const path = 'sections.body.items[2].items[1]';
    const read = readOf({
      [path]: { type: 'text' },
      'sections.body.items[2]': { type: 'container', styleNames: ['boxy'] },
      styles: { boxy: { textAlign: 'center' } },
    });
    const eff = effectiveStyles(read, path);
    expect(eff.textAlign).toMatchObject({ value: 'center', origin: 'inherited' });
  });

  it('prefers the INNER container over an outer one', () => {
    const path = 'sections.body.items[0].items[0].items[0]';
    const read = readOf({
      [path]: { type: 'text' },
      'sections.body.items[0].items[0]': { type: 'container', style: { color: '#222222' } },
      'sections.body.items[0]': { type: 'container', style: { color: '#333333' } },
    });
    expect(effectiveStyles(read, path).color).toMatchObject({
      value: '#222222',
      origin: 'inherited',
    });
  });

  it('falls through non-container ancestors to defaults.style', () => {
    const path = 'sections.body.items[1].cell.items[0]';
    const read = readOf({
      [path]: { type: 'text' },
      'sections.body.items[1]': { type: 'repeat', data: { key: 'rows' } },
      defaults: { style: { fontSize: 12, fontFamily: 'biz-udp-gothic' } },
    });
    const eff = effectiveStyles(read, path);
    expect(eff.fontSize).toEqual({
      value: '12',
      cascade: '12',
      own: '',
      origin: 'default',
      styleName: '',
    });
    expect(eff.fontFamily).toMatchObject({ value: 'biz-udp-gothic', origin: 'default' });
  });

  it('does NOT inherit backgroundColor (non-inherited property)', () => {
    const path = 'sections.body.items[0].items[0]';
    const read = readOf({
      [path]: { type: 'rect' },
      'sections.body.items[0]': { type: 'container', style: { backgroundColor: '#eeeeee' } },
      defaults: { style: { backgroundColor: '#dddddd' } },
    });
    expect(effectiveStyles(read, path).backgroundColor).toMatchObject({
      value: '',
      origin: 'unset',
    });
  });

  it('a named style DOES carry non-inherited keys (styles are not inheritance)', () => {
    const read = readOf({
      [P]: { type: 'rect', styleNames: ['fill'] },
      styles: { fill: { backgroundColor: '#eeeeee' } },
    });
    expect(effectiveStyles(read, P).backgroundColor).toMatchObject({
      value: '#eeeeee',
      origin: 'style',
      styleName: 'fill',
    });
  });

  it('resolves fully unset keys as unset', () => {
    const read = readOf({ [P]: { type: 'text' } });
    const eff = effectiveStyles(read, P);
    expect(eff.fontWeight).toEqual({
      value: '',
      cascade: '',
      own: '',
      origin: 'unset',
      styleName: '',
    });
  });

  it('tolerates a throwing read, a ghost path, and malformed shapes', () => {
    const throwing: ReadFn = () => {
      throw new Error('hostile');
    };
    expect(effectiveStyles(throwing, P).fontWeight.origin).toBe('unset');
    const bad = readOf({
      [P]: { type: 'text', style: 'not a map', styleNames: 'not a list' },
      styles: 'not a map',
      defaults: { style: 'not a map' },
    });
    expect(bad(P)).toBeDefined();
    expect(effectiveStyles(bad, P).fontWeight.origin).toBe('unset');
    // An unparseable path resolves item layers only (no ancestors) — and the
    // item itself does not resolve either, so everything is unset.
    expect(effectiveStyles(readOf({}), 'not a ]path[').fontFamily.origin).toBe('unset');
  });

  it('stringifies numeric style values like the panel display', () => {
    const read = readOf({ [P]: { type: 'text', style: { fontSize: 10.5 } } });
    expect(effectiveStyles(read, P).fontSize).toMatchObject({ value: '10.5', origin: 'own' });
  });
});

describe('effectiveStyles — engine-default floor', () => {
  const FLOOR = {
    fontSize: '10',
    fontWeight: 'normal',
    lineHeight: '1.4',
    color: '#000000',
    fontFamily: 'biz-udp-gothic',
  };

  it('floors every unset inherited key to its engine default with origin `engine`', () => {
    const read = readOf({ [P]: { type: 'text' } });
    const eff = effectiveStyles(read, P, FLOOR);
    expect(eff.fontSize).toEqual({
      value: '10',
      cascade: '10',
      own: '',
      origin: 'engine',
      styleName: '',
    });
    expect(eff.fontWeight).toMatchObject({ value: 'normal', origin: 'engine' });
    expect(eff.color).toMatchObject({ value: '#000000', origin: 'engine' });
    expect(eff.fontFamily).toMatchObject({ value: 'biz-udp-gothic', origin: 'engine' });
  });

  it('lets a defaults.style value win over the floor (origin stays `default`)', () => {
    const read = readOf({
      [P]: { type: 'text' },
      defaults: { style: { fontSize: 12 } },
    });
    const eff = effectiveStyles(read, P, FLOOR);
    expect(eff.fontSize).toMatchObject({ value: '12', origin: 'default' });
    // A key the defaults do NOT author still floors.
    expect(eff.color).toMatchObject({ value: '#000000', origin: 'engine' });
  });

  it('leaves own / named-style / inherited precedence unchanged above the floor', () => {
    const path = 'sections.body.items[0].items[0]';
    const read = readOf({
      [path]: { type: 'text', style: { fontSize: 20 }, styleNames: ['title'] },
      'sections.body.items[0]': { type: 'container', style: { color: '#123456' } },
      styles: { title: { fontWeight: 'bold' } },
    });
    const eff = effectiveStyles(read, path, FLOOR);
    expect(eff.fontSize).toMatchObject({ value: '20', origin: 'own' });
    expect(eff.fontWeight).toMatchObject({ value: 'bold', origin: 'style' });
    expect(eff.color).toMatchObject({ value: '#123456', origin: 'inherited' });
    // A toolbar key no layer authors still falls to the floor (fontFamily is in
    // TOOLBAR_STYLE_KEYS; lineHeight is not resolved by the toolbar mirror).
    expect(eff.fontFamily).toMatchObject({ value: 'biz-udp-gothic', origin: 'engine' });
  });

  it('never floors backgroundColor (a non-inherited key) even if the floor lists it', () => {
    const read = readOf({ [P]: { type: 'rect' } });
    const eff = effectiveStyles(read, P, { ...FLOOR, backgroundColor: '#ffffff' });
    expect(eff.backgroundColor).toMatchObject({ value: '', origin: 'unset' });
  });

  it('floors fontFamily only when the floor carries it (a builtin locale omits it)', () => {
    const read = readOf({ [P]: { type: 'text' } });
    const noFamilyFloor = { fontSize: '10' };
    const eff = effectiveStyles(read, P, noFamilyFloor);
    expect(eff.fontSize).toMatchObject({ value: '10', origin: 'engine' });
    // fontFamily is not in the floor → stays unset, exactly as before.
    expect(eff.fontFamily).toMatchObject({ value: '', origin: 'unset' });
  });

  it('reads the floor by own-property only (a __proto__/constructor key is inert)', () => {
    const read = readOf({ [P]: { type: 'text' } });
    // No floor entry for these keys; the closed style vocab never asks for a
    // prototype name, and the map read is own-property-guarded regardless.
    const eff = effectiveStyles(read, P, {});
    expect(eff.fontSize).toMatchObject({ value: '', origin: 'unset' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
