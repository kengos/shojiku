import { describe, expect, it } from 'vitest';
import { missingBands } from './bandGhosts';
import { buildTree } from './model';

const BODY_ONLY = 'sections:\n  body:\n    type: flow\n    items: []\n';
const BOTH = `sections:
  header:
    height: 40
    items: []
  body:
    type: flow
    items: []
  footer:
    height: 40
    items: []
`;

describe('missingBands', () => {
  it('names both bands for a body-only document, in sections order', () => {
    expect(missingBands(buildTree(BODY_ONLY))).toEqual(['header', 'footer']);
  });

  it('names only the absent one', () => {
    const oneBand = 'sections:\n  body:\n    type: flow\n    items: []\n  footer:\n    items: []\n';
    expect(missingBands(buildTree(oneBand))).toEqual(['header']);
  });

  it('names none when the document authors both', () => {
    expect(missingBands(buildTree(BOTH))).toEqual([]);
  });

  it('offers nothing for an unparseable document — nothing is known about it', () => {
    expect(missingBands(buildTree('sections: [::'))).toEqual([]);
    expect(missingBands(null)).toEqual([]);
  });

  it('offers nothing when there is no body either', () => {
    // `Sections.body` is required on the wire, so authoring a header beside a
    // missing body would produce a document the engine refuses to parse.
    expect(missingBands(buildTree('page:\n  size: A4\n'))).toEqual([]);
  });
});
