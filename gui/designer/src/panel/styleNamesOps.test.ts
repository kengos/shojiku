// @vitest-environment node
//
// The produced file: a band's named-style list, added and removed again through
// a real Editor, leaves the document byte-identical — `removeKey` prunes the map
// the list emptied, so a band the user only tried a style on saves unchanged.
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { styleNamesOp } from './styleNamesOps';

const DOC = `sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        columns:
          - { label: A, data: { key: a } }
`;
const TABLE = 'sections.body.items[0]';

describe('styleNamesOp over a real Editor', () => {
  it('round-trips a band list byte-identical, for every band slot', () => {
    for (const keys of [
      ['header', 'styleNames'],
      ['row', 'styleNames'],
      ['row', 'alternateStyleNames'],
    ]) {
      const editor = Editor.create(DOC);
      expect(editor.apply(styleNamesOp(TABLE, ['banner'], keys)).ok).toBe(true);
      expect(editor.text()).toMatch(/tyleNames: \[\s*banner\s*\]/);
      expect(editor.apply(styleNamesOp(TABLE, [], keys)).ok).toBe(true);
      expect(editor.text()).toBe(DOC);
    }
  });
});
