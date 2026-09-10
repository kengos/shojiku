// The round-trip DECISION, proved at the FILE level over a real `Editor`.
//
// `spanOps.test.ts` pins the op list and `runIdentity.test.ts` pins the
// classification, but neither can see whether the document ACCEPTS the batch —
// a `removeKey` for an absent key fails and `applyAll` then discards the whole
// batch silently. More to the point, the user's decision was about the FILE:
// "rewrite only the touched range", so the proposition worth asserting is that
// the seventeen fragments a reader did not edit come back byte-identical.
//
// The editor DOM is driven here too, rather than being stubbed, because the
// serializer's input is a browser's idea of the document, not ours.

import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { chipMetaMap } from '../text/chipModel';
import { applyMarks } from '../text/runFormat';
import { planRuns } from '../text/runIdentity';
import { buildRunNodes } from '../text/runNodes';
import { serializeRuns } from '../text/runSerialize';
import { narrowRuns } from '../text/spanRuns';
import { spanCommitOps } from './spanOps';

const ITEM = 'sections.body.items[0]';
const META = chipMetaMap([]);

/** A document whose one text item lists `n` hand-authored fragments, each
 * spelled a little differently so a rewrite of any of them is visible. */
function source(n: number): string {
  const spans = Array.from({ length: n }, (_, index) =>
    index % 3 === 0
      ? `      - text: word${index}\n        styleNames: [emphasis]\n`
      : `      - text: word${index}\n`,
  ).join('');
  return `sections:\n  body:\n    items:\n    - type: text\n      box: { x: 0, y: 0, w: 100, h: 20 }\n      spans:\n${spans}`;
}

/** The document as the EMITTER writes it. Comparisons are made against this
 * rather than against the literal above: the YAML layer re-indents on parse, so
 * a raw fixture would make every case fail for a reason that has nothing to do
 * with this change. */
function canonical(n: number): string {
  return Editor.create(source(n)).text();
}

/** Seed a surface from the document, let `edit` drive it, then commit — the
 * whole loop the canvas performs. Returns the document text afterwards. */
function roundTrip(editor: Editor, edit: (root: HTMLElement) => void): string {
  const before = narrowRuns((editor.read(ITEM) as { spans?: unknown }).spans);
  const root = document.createElement('div');
  for (const node of buildRunNodes(document, before, META)) {
    root.appendChild(node);
  }
  document.body.appendChild(root);
  edit(root);
  const ops = spanCommitOps(editor.read.bind(editor), ITEM, planRuns(before, serializeRuns(root)));
  if (ops.length > 0) {
    expect(editor.applyAll(ops).ok, JSON.stringify(ops)).toBe(true);
  }
  root.remove();
  return editor.text();
}

function selectWithin(root: HTMLElement, run: number, from: number, to: number): Selection | null {
  const text = root.children[run]?.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return sel;
}

describe('the flow surface over a real document', () => {
  it('leaves a document nobody edited byte-identical', () => {
    const editor = Editor.create(source(18));
    expect(roundTrip(editor, () => undefined)).toBe(canonical(18));
  });

  it('rewrites ONLY the fragment that was edited, of eighteen', () => {
    // The proposition the user's decision rests on, stated about the FILE.
    const editor = Editor.create(source(18));
    const before = canonical(18).split('\n');
    const after = roundTrip(editor, (root) => {
      (root.children[7]?.firstChild as Text).data = 'EDITED';
    }).split('\n');
    const moved = before
      .map((line, index) => (line === after[index] ? null : index))
      .filter((index): index is number => index !== null);
    expect(moved).toHaveLength(1);
    expect(after[moved[0]]).toContain('EDITED');
    // Seventeen `wordN` lines survive verbatim; the eighteenth is the one that
    // now says EDITED, which is the whole point.
    expect(after.filter((line) => line.includes('word'))).toHaveLength(17);
  });

  it('keeps a neighbour styleNames it never touched', () => {
    const editor = Editor.create(source(4));
    const text = roundTrip(editor, (root) => {
      (root.children[1]?.firstChild as Text).data = 'EDITED';
    });
    // Asserted as ADJACENCY rather than with a literal indent, so the case
    // stays about the fragment keeping its named style and not about how many
    // spaces the emitter chose.
    for (const word of ['word0', 'word3']) {
      expect(text).toMatch(new RegExp(`- text: ${word}\\n\\s+styleNames: \\[\\s*emphasis\\s*\\]`));
    }
  });

  it('splits a fragment when a mark lands mid-word, and the file says so', () => {
    const editor = Editor.create(source(3));
    const text = roundTrip(editor, (root) => {
      applyMarks(root, selectWithin(root, 1, 0, 4), (marks) => ({ ...marks, bold: true }));
    });
    expect(text).toContain('- text: word\n');
    expect(text).toContain('fontWeight: bold');
    expect(text).toContain('- text: "1"');
  });

  it('carries a split fragment styleNames onto BOTH halves', () => {
    // Fragment 0 carries `styleNames: [emphasis]`; splitting it must not drop
    // the author's named style from the half the reader did not select.
    //
    // Counted by NAME rather than by a `[emphasis]` pattern, and that is a fact
    // about the emitter worth knowing: the preserved fragment keeps the FLOW
    // form it was authored in, while the fragment the split created is a fresh
    // node and comes out in BLOCK form. Both are the same list; a pattern
    // written for one spelling silently counts half of them.
    const editor = Editor.create(source(3));
    const text = roundTrip(editor, (root) => {
      applyMarks(root, selectWithin(root, 0, 0, 4), (marks) => ({ ...marks, italic: true }));
    });
    expect(text.match(/emphasis/g)).toHaveLength(2);
    expect(text).toContain('styleNames: [ emphasis ]');
    expect(text).toMatch(/styleNames:\n\s+- emphasis/);
  });

  it('un-bolding removes the key rather than authoring the engine keyword', () => {
    const editor = Editor.create(source(2));
    roundTrip(editor, (root) => {
      applyMarks(root, selectWithin(root, 0, 0, 5), (marks) => ({ ...marks, bold: true }));
    });
    expect(editor.text()).toContain('fontWeight: bold');
    const cleared = roundTrip(editor, (root) => {
      applyMarks(root, selectWithin(root, 0, 0, 5), (marks) => ({ ...marks, bold: false }));
    });
    expect(cleared).not.toContain('fontWeight');
    expect(cleared).not.toContain('normal');
  });

  it('removes a fragment the reader deleted, and only that one', () => {
    const editor = Editor.create(source(4));
    const text = roundTrip(editor, (root) => {
      root.children[2]?.remove();
    });
    expect(text).not.toContain('word2');
    for (const kept of ['word0', 'word1', 'word3']) {
      expect(text).toContain(kept);
    }
  });

  it("leaves NO remnant when the reader deletes a fragment's words", () => {
    // Written as `text: \"\"` it would be a fragment the engine does not report
    // (`empty_span` needs neither key) and the panel cannot remove.
    const editor = Editor.create(source(4));
    const text = roundTrip(editor, (root) => {
      (root.children[1]?.firstChild as Text).data = '';
    });
    expect(text).not.toContain("text: ''");
    expect(text).not.toContain('text: ""');
    expect(text).not.toContain('word1');
    for (const kept of ['word0', 'word2', 'word3']) {
      expect(text).toContain(kept);
    }
  });

  it("keeps a document's own EMPTY fragment across a commit that edits its neighbour", () => {
    // The other half of the same rule: `{}` is a fragment an author wrote, and
    // a commit touching the item next to it must not delete it.
    const editor = Editor.create(source(2).replace('      - text: word1\n', '      - {}\n'));
    const text = roundTrip(editor, (root) => {
      (root.children[0]?.firstChild as Text).data = 'EDITED';
    });
    expect(text).toContain('EDITED');
    expect(text).toMatch(/-\s*\{\s*\}|- \{\}/);
  });

  it('adds a fragment where the reader typed one, without disturbing the rest', () => {
    const editor = Editor.create(source(3));
    const text = roundTrip(editor, (root) => {
      const added = document.createElement('span');
      added.className = 'sj-run';
      added.appendChild(document.createTextNode('NEW'));
      root.children[1]?.after(added);
    });
    expect(text).toContain('- text: NEW');
    expect(text.indexOf('word1')).toBeLessThan(text.indexOf('NEW'));
    expect(text.indexOf('NEW')).toBeLessThan(text.indexOf('word2'));
  });
});
