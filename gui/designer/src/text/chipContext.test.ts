import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { readDefinitionsView } from '../palette/model';
import { chipContextFor } from './chipContext';

const DEFINITIONS = [
  'properties:',
  '  store_name: { type: string, title: 店舗名, example: 青山店 }',
  '  items:',
  '    type: array',
  '    items:',
  '      type: object',
  '      properties:',
  '        品名: { type: string, title: 品名 }',
  '        quantity: { type: number, example: 1 }',
  '',
].join('\n');

const PARAMS = JSON.stringify({ store_name: '青山店', items: [{ 品名: 'みかん', quantity: 3 }] });

const groups = readDefinitionsView(DEFINITIONS);

const TABLE = 'sections.body.items[0]';
const CELL = 'sections.body.items[0].columns[0].cell.items[0]';
const BODY_TEXT = 'sections.body.items[1]';

const read: ReadFn = (path) => {
  const doc: Record<string, unknown> = {
    [TABLE]: { type: 'table', data: { key: 'items' } },
    [CELL]: {
      type: 'text',
      text: '{f1}',
      link: { url: 'https://example.test/{ref}' },
      bindings: { f1: { key: '品名' } },
    },
    [BODY_TEXT]: { type: 'text', text: 'plain' },
  };
  return doc[path];
};

describe('chipContextFor', () => {
  it('offers the same rows twice at document scope', () => {
    const chips = chipContextFor(read, BODY_TEXT, groups, PARAMS, undefined);
    expect(chips.scope).toBeNull();
    expect(chips.options.map((row) => row.key)).toEqual(['store_name']);
    // The insert menu shows no second section there, and a document-scope
    // declaration still resolves its label through the same rows.
    expect(chips.documentOptions).toBe(chips.options);
  });

  it('separates the row rows from the document rows inside a cell', () => {
    const chips = chipContextFor(read, CELL, groups, PARAMS, undefined);
    expect(chips.scope).toBe('items');
    expect(chips.options.map((row) => row.key)).toEqual(['品名', 'quantity']);
    expect(chips.documentOptions.map((row) => row.key)).toEqual(['store_name']);
    // Samples come from the live params at the right scope.
    expect(chips.options[0].sample).toBe('みかん');
    expect(chips.documentOptions[0].sample).toBe('青山店');
  });

  it('reads the declarations the item already carries', () => {
    expect(chipContextFor(read, CELL, groups, PARAMS, undefined).declared.get('f1')).toEqual({
      key: '品名',
      scope: null,
    });
    expect(chipContextFor(read, BODY_TEXT, groups, PARAMS, undefined).declared.size).toBe(0);
  });

  it('gates authoring on the capability, defaulting to the bundled engine', () => {
    expect(chipContextFor(read, CELL, groups, PARAMS, undefined).canDeclare).toBe(true);
    expect(chipContextFor(read, CELL, groups, PARAMS, ['binding.declarations']).canDeclare).toBe(
      true,
    );
    expect(chipContextFor(read, CELL, groups, PARAMS, ['binding.scope']).canDeclare).toBe(false);
  });

  it('reports the names the item’s other surfaces interpolate', () => {
    // The mint must avoid them: one declaration map serves the whole item, so
    // a minted `ref` would silently redirect that link URL.
    expect(chipContextFor(read, CELL, groups, PARAMS, undefined).otherNames).toEqual(['ref']);
    expect(chipContextFor(read, BODY_TEXT, groups, PARAMS, undefined).otherNames).toEqual([]);
  });

  it('degrades to free entry when there are no definitions', () => {
    const chips = chipContextFor(read, BODY_TEXT, null, PARAMS, undefined);
    expect(chips.options).toEqual([]);
    expect(chips.documentOptions).toEqual([]);
  });
});
