// @vitest-environment node
//
// The flow surface's READ side. The cases that matter are the ones the panel's
// own `spansModel` tests do not cover, because this model answers a different
// question: which MARKS a fragment carries, and — the boundary decision — which
// style keys are deliberately absent from the answer.

import { describe, expect, it } from 'vitest';
import { NO_MARKS, narrowRuns, readMarks, sameMarks } from './spanRuns';

describe('readMarks', () => {
  it('reads the four marks the flow surface paints', () => {
    expect(
      readMarks({
        fontWeight: 'bold',
        fontStyle: 'italic',
        textDecoration: 'line_through',
        color: '#112233',
      }),
    ).toEqual({ bold: true, italic: true, decoration: 'line_through', color: '#112233' });
  });

  it('reads NOTHING from the three METRIC keys', () => {
    // The boundary `canvas/InlineTextEditor` records — the surface is not
    // WYSIWYG, so a metric is never painted and never read here. If this ever
    // starts returning them, the surface has begun predicting the engine's line
    // breaks, which is the thing the decision forbids.
    const marks = readMarks({ fontSize: '18pt', fontFamily: 'Serif', letterSpacing: '2pt' });
    expect(marks).toEqual(NO_MARKS);
  });

  it('degrades every hostile shape to the unset mark', () => {
    for (const hostile of [undefined, null, 'style', 42, ['fontWeight']]) {
      expect(readMarks(hostile)).toEqual(NO_MARKS);
    }
  });

  it('degrades an unknown decoration rather than carrying it through', () => {
    expect(readMarks({ textDecoration: 'overline' }).decoration).toBe('none');
    expect(readMarks({ textDecoration: 42 }).decoration).toBe('none');
  });

  it('takes the wire spelling of line-through, which is NOT camelCase', () => {
    // `engine/core/src/style/enums.rs` renames this one enum `snake_case`,
    // alone among the style keys. A surface that guessed `lineThrough` would
    // author a value the engine refuses.
    expect(readMarks({ textDecoration: 'line_through' }).decoration).toBe('line_through');
    expect(readMarks({ textDecoration: 'lineThrough' }).decoration).toBe('none');
  });
});

describe('narrowRuns', () => {
  it('reads a text fragment, a bound one, and the marks and carriers of each', () => {
    expect(
      narrowRuns([
        { text: 'plain' },
        { data: { key: 'order.total' }, style: { fontWeight: 'bold' } },
        { text: 'linked', link: { url: 'https://example.com' }, styleNames: ['strong'] },
      ]),
    ).toEqual([
      {
        index: 0,
        kind: 'text',
        content: 'plain',
        marks: NO_MARKS,
        hasStyleNames: false,
        linked: false,
      },
      {
        index: 1,
        kind: 'bound',
        content: 'order.total',
        marks: { ...NO_MARKS, bold: true },
        hasStyleNames: false,
        linked: false,
      },
      {
        index: 2,
        kind: 'text',
        content: 'linked',
        marks: NO_MARKS,
        hasStyleNames: true,
        linked: true,
      },
    ]);
  });

  it('returns nothing for a non-array spans', () => {
    for (const hostile of [undefined, null, 'spans', 42, { 0: { text: 'a' } }]) {
      expect(narrowRuns(hostile)).toEqual([]);
    }
  });

  it('skips a non-map entry and keeps the WIRE index of the ones it keeps', () => {
    // The same structural promise `spansModel` makes, restated here because
    // this model's indices are what the commit's provenance rule reads.
    const runs = narrowRuns([{ text: 'a' }, 'not a map', { text: 'c' }]);
    expect(runs.map((run) => run.index)).toEqual([0, 2]);
  });

  it('reads an empty styleNames as carrying none', () => {
    expect(narrowRuns([{ text: 'a', styleNames: [] }])[0]?.hasStyleNames).toBe(false);
    expect(narrowRuns([{ text: 'a', styleNames: 'strong' }])[0]?.hasStyleNames).toBe(false);
  });

  it('reads a fragment with an empty link url as unlinked', () => {
    expect(narrowRuns([{ text: 'a', link: { url: '' } }])[0]?.linked).toBe(false);
    expect(narrowRuns([{ text: 'a', link: 'https://x' }])[0]?.linked).toBe(false);
  });

  it('prefers the binding over the text when a fragment carries both', () => {
    // The engine's own order: `resolve_content` returns the binding first and
    // `validate/spans.rs` reports the conflict with `winner: data`.
    const run = narrowRuns([{ text: 'ignored', data: { key: 'k' } }])[0];
    expect(run).toMatchObject({ kind: 'bound', content: 'k' });
  });

  it('bounds the list at MAX_SPANS, the engine constant', () => {
    const many = Array.from({ length: 300 }, (_, index) => ({ text: `f${index}` }));
    expect(narrowRuns(many)).toHaveLength(256);
  });
});

describe('sameMarks', () => {
  it('is true only when all four agree', () => {
    expect(sameMarks(NO_MARKS, { ...NO_MARKS })).toBe(true);
    expect(sameMarks(NO_MARKS, { ...NO_MARKS, bold: true })).toBe(false);
    expect(sameMarks(NO_MARKS, { ...NO_MARKS, italic: true })).toBe(false);
    expect(sameMarks(NO_MARKS, { ...NO_MARKS, decoration: 'underline' })).toBe(false);
    expect(sameMarks(NO_MARKS, { ...NO_MARKS, color: '#000000' })).toBe(false);
  });
});
