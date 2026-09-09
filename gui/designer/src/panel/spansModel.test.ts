// @vitest-environment node
//
// The `spans:` read side. Every case here is about a shape the ENGINE would
// refuse but the panel can still be handed — a mid-edit document, or a hostile
// one — plus the one structural promise the write path depends on: a skipped
// entry must not renumber its neighbours.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_SPANS, narrowSpans, readSpans } from './spansModel';

const ITEM = {
  type: 'text',
  spans: [
    { text: 'Shojiku ' },
    { text: 'links', link: { url: 'https://example.com' } },
    { data: { key: 'order.total' } },
    {},
  ],
};

describe('narrowSpans', () => {
  it('returns one view per fragment, carrying text, binding key and url', () => {
    expect(narrowSpans(ITEM.spans)).toEqual([
      {
        index: 0,
        text: 'Shojiku ',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
      {
        index: 1,
        text: 'links',
        dataKey: '',
        url: 'https://example.com',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
      {
        index: 2,
        text: '',
        dataKey: 'order.total',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
      {
        index: 3,
        text: '',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
    ]);
  });

  it('returns nothing for a non-array spans', () => {
    for (const hostile of [undefined, null, 'spans', 42, { 0: { text: 'a' } }]) {
      expect(narrowSpans(hostile)).toEqual([]);
    }
  });

  it('skips a non-map entry and keeps the WIRE index of the ones it keeps', () => {
    // The index is what `<item>.spans[i]` addresses, so renumbering here would
    // aim every later fragment's link write one element too early.
    const views = narrowSpans([{ text: 'a' }, 'not a map', ['nor this'], { text: 'd' }]);
    expect(views.map((v) => v.index)).toEqual([0, 3]);
    expect(views.map((v) => v.text)).toEqual(['a', 'd']);
  });

  it('degrades a non-string text, a non-map link and a non-string url', () => {
    expect(
      narrowSpans([
        { text: { nested: true }, link: 'https://example.com' },
        { text: 'ok', link: { url: ['https://example.com'] } },
        { data: 'not a map' },
      ]),
    ).toEqual([
      {
        index: 0,
        text: '',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
      {
        index: 1,
        text: 'ok',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
      {
        index: 2,
        text: '',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
    ]);
  });

  it('renders at most MAX_SPANS rows, which is what the engine draws', () => {
    const many = Array.from({ length: MAX_SPANS + 40 }, (_, i) => ({ text: `f${i}` }));
    const views = narrowSpans(many);
    expect(views).toHaveLength(MAX_SPANS);
    expect(views[views.length - 1].index).toBe(MAX_SPANS - 1);
  });

  it('carries the named styles and the METRIC style values', () => {
    // The metrics live on the PANEL's model, not the flow surface's: the canvas
    // editor is deliberately not WYSIWYG, so it shows no size — and a fragment
    // whose size is only editable there would have no editing surface at all.
    expect(
      narrowSpans([
        {
          text: 'a',
          styleNames: ['emphasis', 42, 'lead'],
          style: {
            fontSize: '14pt',
            fontFamily: 'Serif',
            letterSpacing: '1pt',
            fontWeight: 'bold',
          },
        },
      ])[0],
    ).toEqual({
      index: 0,
      text: 'a',
      dataKey: '',
      url: '',
      // The non-string entry is dropped rather than carried through — this is
      // document text, and a control cannot show what it cannot name.
      styleNames: ['emphasis', 'lead'],
      // `fontWeight` is a MARK and is deliberately absent: the flow surface
      // owns it, and a second control here would be a second way to say it.
      // `letterSpacing` is absent by design: `panel/styleFieldSpecs` has no
      // entry for it, so it is not authorable at the ITEM level either.
      metrics: { fontSize: '14pt', fontFamily: 'Serif' },
    });
  });

  it('reads a hostile styleNames and a hostile style as setting neither', () => {
    expect(narrowSpans([{ styleNames: 'emphasis', style: 'big' }])[0]).toMatchObject({
      styleNames: [],
      metrics: { fontSize: '', fontFamily: '' },
    });
  });

  it('renders a fragment whose text is a prototype name as ordinary text', () => {
    // Nothing looks a span up in a plain-object table — the views are keyed by
    // a numeric wire index — so these are strings and nothing more.
    expect(narrowSpans([{ text: '__proto__' }, { text: 'constructor' }])).toEqual([
      {
        index: 0,
        text: '__proto__',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
      {
        index: 1,
        text: 'constructor',
        dataKey: '',
        url: '',
        styleNames: [],
        metrics: { fontSize: '', fontFamily: '' },
      },
    ]);
  });
});

describe('readSpans', () => {
  it('reads through a ReadFn, and answers [] for an unreadable node', () => {
    expect(readSpans(() => ITEM, 'p')).toHaveLength(4);
    expect(
      readSpans(() => {
        throw new Error('mid-edit');
      }, 'p'),
    ).toEqual([]);
  });
});

describe('MAX_SPANS', () => {
  it('is the engine cap, read from the Rust rather than restated', () => {
    // A drift guard is only one if it reads the OTHER side. The count control
    // is what stops a regex that silently matches nothing from passing.
    const rust = readFileSync(
      fileURLToPath(new URL('../../../../engine/core/src/template/spans.rs', import.meta.url)),
      'utf8',
    );
    const matches = [...rust.matchAll(/pub const MAX_SPANS: usize = (\d+);/g)];
    expect(matches).toHaveLength(1);
    expect(MAX_SPANS).toBe(Number(matches[0][1]));
  });
});
