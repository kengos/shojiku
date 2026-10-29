import { describe, expect, it } from 'vitest';
import { type CatalogNode, defNode, defs, itemBranch, type ObjectNode } from './defs';
import type { CatalogField, FieldSpec } from './fieldKinds';
import { fieldSpec, MAX_SPEC_DEPTH } from './fieldSpec';

// Over the REAL committed catalog: each kind is read off the node the engine
// generates for a real key, so a change to the engine's shapes reds here. The
// depth-cap and unwritten-shape cases build their nodes inline, since the
// catalog writes no such shapes.
const COMPOSITES: ReadonlySet<string> = new Set(['TextDecoration', 'TextCombineUpright']);
const NONE: ReadonlySet<string> = new Set();

function styleNode(key: string): CatalogNode {
  return defs().Style.properties[key];
}

function def(name: string): ObjectNode {
  return defNode(`#/$defs/${name}`) as ObjectNode;
}

function spec(node: CatalogNode): FieldSpec {
  return fieldSpec(node, COMPOSITES);
}

function entryField(map: FieldSpec, key: string): CatalogField | undefined {
  return map.kind === 'map' ? map.entry.find((field) => field.key === key) : undefined;
}

describe('fieldSpec — one kind per catalog shape', () => {
  it('reads a closed set of strings as enum, from `enum` and from a oneOf of consts', () => {
    expect(spec(styleNode('fontStyle'))).toEqual({ kind: 'enum', values: ['normal', 'italic'] });
    expect(spec(styleNode('lineBreak'))).toEqual({
      kind: 'enum',
      values: ['normal', 'strict', 'loose', 'anywhere'],
    });
  });

  it('reads a $ref to Length as length, with the referring node bounds', () => {
    expect(spec(styleNode('fontSize'))).toEqual({
      kind: 'length',
      bounds: { minimum: undefined, exclusiveMinimum: 0, maximum: 1000 },
    });
    expect(spec(styleNode('letterSpacing'))).toEqual({
      kind: 'length',
      bounds: { minimum: -1000, exclusiveMinimum: undefined, maximum: 1000 },
    });
  });

  it('reads a number with its bounds, an integer as a number, and a fraction as percent', () => {
    expect(spec(styleNode('lineHeight'))).toEqual({
      kind: 'number',
      bounds: { minimum: undefined, exclusiveMinimum: 0, maximum: 1000 },
    });
    expect(spec(def('Schema').properties.maxItems)).toEqual({
      kind: 'number',
      bounds: { minimum: 0, exclusiveMinimum: undefined, maximum: undefined },
    });
    expect(spec(styleNode('opacity'))).toEqual({ kind: 'percent' });
    expect(spec(def('LineStyle').properties.opacity)).toEqual({ kind: 'percent' });
    // Positive control: a number the marker does not name stays a number.
    expect(spec(def('LineStyle').properties.width).kind).toBe('number');
  });

  it('reads a boolean', () => {
    expect(spec(itemBranch('table')?.properties.repeatHeader as CatalogNode)).toEqual({
      kind: 'boolean',
    });
  });

  it('reads a colour-marked string as color, and an unmarked string as text', () => {
    expect(spec(styleNode('color'))).toEqual({ kind: 'color' });
    expect(spec(styleNode('backgroundColor'))).toEqual({ kind: 'color' });
    expect(spec(def('LineStyle').properties.color)).toEqual({ kind: 'color' });
    // Positive control: the same `type: [string, null]` with no marker.
    expect(spec(styleNode('fontFamily'))).toEqual({ kind: 'text' });
    expect(spec(itemBranch('list')?.properties.overflowText as CatalogNode)).toEqual({
      kind: 'text',
    });
  });

  it('reads a ref-marked string as ref, naming what it refers to', () => {
    expect(spec(def('Binding').properties.key)).toEqual({ kind: 'ref', ref: 'dataKey' });
    expect(spec(def('Binding').properties.format)).toEqual({ kind: 'ref', ref: 'format' });
  });

  it('reads a scalar-or-per-side union as sides, with the scalar arm kind and the key bounds', () => {
    expect(spec(styleNode('borderColor'))).toEqual({ kind: 'sides', scalar: { kind: 'color' } });
    expect(spec(styleNode('borderStyle'))).toEqual({
      kind: 'sides',
      scalar: { kind: 'enum', values: ['solid', 'double', 'dashed', 'dotted'] },
    });
    expect(spec(styleNode('borderWidth'))).toEqual({
      kind: 'sides',
      scalar: {
        kind: 'number',
        bounds: { minimum: 0, exclusiveMinimum: undefined, maximum: 1000 },
      },
    });
  });

  it('stops at a $ref the caller names as a composite, and only then', () => {
    expect(spec(styleNode('textDecoration'))).toEqual({
      kind: 'composite',
      name: 'TextDecoration',
    });
    expect(spec(styleNode('textCombineUpright'))).toEqual({
      kind: 'composite',
      name: 'TextCombineUpright',
    });
    // Unnamed, the same nodes read by shape: a five-value enum, and an
    // enum-or-object union no generic control edits.
    expect(fieldSpec(styleNode('textDecoration'), NONE).kind).toBe('enum');
    expect(fieldSpec(styleNode('textCombineUpright'), NONE)).toEqual({ kind: 'opaque' });
    // An editor registry keyed by $defs name serves as the name set.
    const registry = new Map([['TextDecoration', 'editor']]);
    expect(fieldSpec(styleNode('textDecoration'), registry).kind).toBe('composite');
  });

  it('reads a map of named entries as map, with each entry field read in turn', () => {
    const bindings = spec(itemBranch('list')?.properties.bindings as CatalogNode);
    expect(bindings.kind).toBe('map');
    expect(entryField(bindings, 'key')).toEqual({
      key: 'key',
      spec: { kind: 'ref', ref: 'dataKey' },
      capability: undefined,
      required: true,
      initial: undefined,
    });
    expect(entryField(bindings, 'placeholder')).toEqual({
      key: 'placeholder',
      spec: { kind: 'text' },
      capability: 'binding.placeholder',
      required: false,
      initial: undefined,
    });
    expect(entryField(bindings, 'scope')?.spec).toEqual({
      kind: 'enum',
      values: ['element', 'document'],
    });
    expect(entryField(bindings, 'format')?.spec).toEqual({ kind: 'ref', ref: 'format' });
    // The named-style registry is a map too, of every Style key.
    const styles = spec(def('Template').properties.styles);
    expect(styles.kind === 'map' && styles.entry.length).toBe(24);
  });

  it('reads a fixed-key object, an array and an untyped node as opaque', () => {
    expect(spec({ $ref: '#/$defs/PageSpec' })).toEqual({ kind: 'opaque' });
    expect(spec(itemBranch('list')?.properties.styleNames as CatalogNode)).toEqual({
      kind: 'opaque',
    });
    expect(spec(def('Schema').properties.example)).toEqual({ kind: 'opaque' });
    // A union with two non-null arms (a format name or an inline format).
    expect(spec({ $ref: '#/$defs/FormatRef' })).toEqual({ kind: 'opaque' });
  });

  it('ends a recursive map chain as opaque at the depth cap', () => {
    // A data definition's `properties` maps names to definitions, whose own
    // `properties` map does the same, without end.
    let current = spec(def('Definitions').properties.properties);
    let maps = 0;
    while (current.kind === 'map') {
      maps += 1;
      current = (entryField(current, 'properties') as CatalogField).spec;
    }
    expect(maps).toBe(MAX_SPEC_DEPTH + 1);
    expect(current).toEqual({ kind: 'opaque' });
  });

  it('counts every wrapper toward the depth cap', () => {
    const sidesOf = (scalar: CatalogNode): CatalogNode => ({
      oneOf: [scalar, { type: 'object', properties: { top: {}, right: {}, bottom: {}, left: {} } }],
    });
    // `count` nullable wrappers put the node inside them at depth `count`.
    const nullable = (node: CatalogNode, count: number): CatalogNode =>
      count === 0 ? node : nullable({ anyOf: [node, { type: 'null' }] }, count - 1);
    expect(spec(nullable({ type: 'string' }, MAX_SPEC_DEPTH))).toEqual({ kind: 'text' });
    expect(spec(nullable({ type: 'string' }, MAX_SPEC_DEPTH + 1))).toEqual({ kind: 'opaque' });
    // A $ref target sits one deeper than the $ref.
    const kind = { $ref: '#/$defs/BorderStyleKind' };
    expect(spec(nullable(kind, MAX_SPEC_DEPTH - 1)).kind).toBe('enum');
    expect(spec(nullable(kind, MAX_SPEC_DEPTH))).toEqual({ kind: 'opaque' });
    // So does a sides union's scalar arm.
    const sides = sidesOf({ type: 'string' });
    expect(spec(nullable(sides, MAX_SPEC_DEPTH - 1))).toEqual({
      kind: 'sides',
      scalar: { kind: 'text' },
    });
    expect(spec(nullable(sides, MAX_SPEC_DEPTH))).toEqual({
      kind: 'sides',
      scalar: { kind: 'opaque' },
    });
  });

  it('reads the shapes the catalog does not write as opaque', () => {
    const opaque = { kind: 'opaque' };
    // References that leave $defs or name nothing there.
    expect(spec({ $ref: 'other.json#/Style' })).toEqual(opaque);
    expect(spec({ $ref: '#/$defs/Nope' })).toEqual(opaque);
    expect(spec({ $ref: '#/$defs/toString' })).toEqual(opaque);
    // A non-string or empty enum, a one-arm union, a type list with two
    // non-null types.
    expect(spec({ enum: [1, 2] })).toEqual(opaque);
    expect(spec({ enum: [] })).toEqual(opaque);
    expect(spec({ oneOf: [] })).toEqual(opaque);
    expect(spec({ oneOf: [{ type: 'number' }] })).toEqual(opaque);
    expect(spec({ type: ['string', 'number'] })).toEqual(opaque);
    // Maps whose entries are not objects of named keys.
    expect(spec({ type: 'object' })).toEqual(opaque);
    expect(spec({ type: 'object', additionalProperties: { $ref: '#/$defs/Nope' } })).toEqual(
      opaque,
    );
    expect(spec({ type: 'object', additionalProperties: { $ref: '#/$defs/Length' } })).toEqual(
      opaque,
    );
    // An inline entry object reads like a referenced one.
    expect(
      spec({
        type: 'object',
        additionalProperties: { type: 'object', properties: { note: { type: 'string' } } },
      }),
    ).toEqual({
      kind: 'map',
      entry: [
        {
          key: 'note',
          spec: { kind: 'text' },
          capability: undefined,
          required: false,
          initial: undefined,
        },
      ],
    });
  });
});
