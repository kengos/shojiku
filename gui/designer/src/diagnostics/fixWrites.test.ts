// Tests for the quick-fix builders that WRITE a value. Reached through
// `fixFor`, so the registry wiring is exercised with them: a builder that works
// and is not registered fixes nothing.
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { ArgValue, Diagnostic } from '../engine/types';
import { fixFor, type ReadNode } from './fixModel';

function diag(
  code: string,
  { path, args = {} }: { path?: string; args?: Record<string, ArgValue> } = {},
): Diagnostic {
  return { severity: 'warning', code, category: 'layout', message: code, args, path };
}

function editorRead(ed: Editor): ReadNode {
  return (path) => ed.read(path);
}

const PATH = 'sections.body.items[0]';

/** A one-item template whose single item carries `item` verbatim. */
function template(item: string): string {
  return `sections:\n  body:\n    items:\n      - ${item}\n`;
}

/** Applies the chosen candidate through a real Editor and returns the text plus
 * a one-step-undo probe — every positive case proves round-trip + single undo. */
function apply(src: string, d: Diagnostic, pick = 0): { text: string; undone: string } {
  const ed = Editor.create(src);
  const candidates = fixFor(d, editorRead(ed));
  if (candidates === null) throw new Error('expected a fix');
  const chosen = candidates[pick];
  if (chosen === undefined) throw new Error(`no candidate at ${pick}`);
  expect(ed.applyAll(chosen.ops).ok).toBe(true);
  const text = ed.text();
  expect(ed.undo()).toBe(true);
  return { text, undone: ed.text() };
}

function fixesFor(src: string, d: Diagnostic) {
  return fixFor(d, editorRead(Editor.create(src)));
}

describe('image_source_conflict — two candidates, named by what SURVIVES', () => {
  // A plain path, not a `data:` URI — a data-URI src CONTAINS the substring
  // `data:`, so a `not.toContain('data:')` assertion would pass or fail for the
  // wrong reason.
  const SRC = template('type: image\n        src: logo.png\n        data: { key: logo }');

  it('offers exactly two candidates, src first', () => {
    const fixes = fixesFor(SRC, diag('image_source_conflict', { path: PATH }));
    expect(fixes?.map((f) => f.labelKey)).toEqual([
      'diagnostics.fix.keep.src',
      'diagnostics.fix.keep.data',
    ]);
  });

  it('keeping src drops data, and keeping data drops src', () => {
    // Asserted as two clauses because a swapped pair is exactly the defect this
    // fix could ship: both candidates "work", and each destroys the wrong half.
    const keepSrc = apply(SRC, diag('image_source_conflict', { path: PATH }), 0);
    expect(keepSrc.text).toContain('src:');
    expect(keepSrc.text).not.toContain('data:');
    const keepData = apply(SRC, diag('image_source_conflict', { path: PATH }), 1);
    expect(keepData.text).toContain('data:');
    expect(keepData.text).not.toContain('src:');
    expect(keepData.undone).toBe(SRC);
  });

  it('offers nothing when only one source is present (a stale diagnostic)', () => {
    const one = template('type: image\n        src: logo.png');
    expect(fixesFor(one, diag('image_source_conflict', { path: PATH }))).toBeNull();
  });

  it('offers nothing for a hostile or unreadable node', () => {
    expect(
      fixesFor(SRC, diag('image_source_conflict', { path: 'sections.body.items[9]' })),
    ).toBeNull();
    expect(fixesFor(SRC, diag('image_source_conflict'))).toBeNull();
  });
});

describe('the missing-size family — writes only what is absent', () => {
  const CODES = [
    'rect_missing_size',
    'image_missing_size',
    'qr_missing_size',
    'mark_missing_size',
  ] as const;

  it('writes both dimensions when the box has neither', () => {
    for (const code of CODES) {
      const src = template('type: rect');
      const { text, undone } = apply(src, diag(code, { path: PATH }));
      expect(text, code).toContain('w: 100');
      expect(text, code).toContain('h: 100');
      expect(undone, code).toBe(src);
    }
  });

  it('writes ONLY the missing dimension when the other is authored', () => {
    // A rect the author already sized in one axis keeps that size — the fix
    // fills a gap, it does not impose a shape.
    for (const code of CODES) {
      const { text } = apply(
        template('type: rect\n        box: { w: 240 }'),
        diag(code, { path: PATH }),
      );
      expect(text, code).toContain('w: 240');
      expect(text, code).toContain('h: 100');
    }
  });

  it('offers nothing when both dimensions are already present', () => {
    const sized = template('type: rect\n        box: { w: 240, h: 60 }');
    expect(fixesFor(sized, diag('rect_missing_size', { path: PATH }))).toBeNull();
  });

  it('offers nothing when the box is present but is not a map', () => {
    // A hand-written `box: 5`. The op layer refuses this (`not_a_map`) and the
    // document is never corrupted — but the button would have been offered and
    // would have done nothing when pressed, and a fix that silently no-ops is
    // worse than no fix: the author believes the warning has been handled.
    const scalarBox = template('type: rect\n        box: 5');
    expect(fixesFor(scalarBox, diag('rect_missing_size', { path: PATH }))).toBeNull();
    const listBox = template('type: rect\n        box: [1, 2]');
    expect(fixesFor(listBox, diag('rect_missing_size', { path: PATH }))).toBeNull();
  });

  it('offers nothing for a node that is not an ITEM', () => {
    // A stale or forged path can address a section or a list; authoring
    // `box.w`/`box.h` there produces wire the engine rejects, from a button
    // the author had every reason to trust. `type` is the discriminator.
    expect(fixesFor(template('type: rect'), diag('rect_missing_size'))).toBeNull();
    expect(
      fixesFor(template('type: rect'), diag('rect_missing_size', { path: 'sections.body' })),
    ).toBeNull();
    expect(
      fixesFor(template('type: rect'), diag('rect_missing_size', { path: 'sections' })),
    ).toBeNull();
  });
});

describe('the overflow family — shrink by exactly the reported excess', () => {
  const WIDE = template('type: rect\n        box: { w: 500, h: 20 }');
  const CODES = ['flow_item_overflow', 'sheet_overflow', 'child_overflow'] as const;

  it('sets box.w to the authored width minus the overflow', () => {
    for (const code of CODES) {
      const { text, undone } = apply(WIDE, diag(code, { path: PATH, args: { over: 41.3 } }));
      expect(text, code).toContain('w: 458.7');
      expect(undone, code).toBe(WIDE);
    }
  });

  it('carries the SAME number in the label as it writes', () => {
    // The label is what the author agreed to; an op that writes something else
    // is a lie the panel cannot detect.
    const fixes = fixesFor(WIDE, diag('flow_item_overflow', { path: PATH, args: { over: 41.3 } }));
    expect(fixes?.[0].labelArgs).toEqual({ w: 458.7 });
    expect(fixes?.[0].ops).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'w'], value: 458.7 },
    ]);
  });

  it('offers nothing when the width is not a number this can shrink', () => {
    // A percentage width, an absent one, and an `auto`-shaped one each have
    // nothing to subtract from — a button there would author nonsense.
    for (const box of ['box: { w: "100%", h: 20 }', 'box: { h: 20 }', 'box: { w: fill, h: 20 }']) {
      expect(
        fixesFor(
          template(`type: rect\n        ${box}`),
          diag('flow_item_overflow', { path: PATH, args: { over: 10 } }),
        ),
        box,
      ).toBeNull();
    }
  });

  it('offers nothing when the overflow amount is missing or not finite', () => {
    // A tampered payload must not reach the arithmetic: a non-finite width
    // written into the document is worse than the overflow it came from.
    const cases: Record<string, ArgValue>[] = [
      {},
      { over: 'lots' },
      { over: Number.NaN },
      { over: Number.POSITIVE_INFINITY },
    ];
    for (const args of cases) {
      expect(
        fixesFor(WIDE, diag('flow_item_overflow', { path: PATH, args })),
        JSON.stringify(args),
      ).toBeNull();
    }
  });

  it('offers nothing when shrinking would leave nothing (over >= width)', () => {
    // An item narrower than its own overflow cannot be fixed by shrinking, and
    // a zero-or-negative width is not a document anyone wants written.
    for (const over of [500, 600]) {
      expect(
        fixesFor(WIDE, diag('flow_item_overflow', { path: PATH, args: { over } })),
        String(over),
      ).toBeNull();
    }
  });

  it('offers no shrink for a node that is not an ITEM', () => {
    expect(
      fixesFor(WIDE, diag('flow_item_overflow', { path: 'sections.body', args: { over: 10 } })),
    ).toBeNull();
  });

  it('has NO entry for flex_row_overflow', () => {
    // Deliberate: that code reports a ROW's children collectively needing more
    // room than the box, so there is no single item width to shrink. If this
    // ever gains a fix it will be a different shape, not this one.
    expect(
      fixesFor(WIDE, diag('flex_row_overflow', { path: PATH, args: { needed: 600, avail: 500 } })),
    ).toBeNull();
  });
});
