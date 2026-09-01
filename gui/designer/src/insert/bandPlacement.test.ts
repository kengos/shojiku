// Tests for bandPlacement.ts — which kinds are band-only, where a band
// item lands (floored pixel-derived heights), and the placed snippet shape.
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { bandInsertY, bandPlaced, requiresBand } from './bandPlacement';
import { insertSnippet, RULE_Y_PT } from './insertSnippet';
import { BODY_ITEMS_PATH } from './model';

describe('band placement', () => {
  it('knows which kinds are band-only', () => {
    expect(requiresBand('pageNumber')).toBe(true);
    expect(requiresBand('text')).toBe(false);
    expect(requiresBand('rect')).toBe(false);
  });

  it('places a header item at the top of the margin box and a footer item near its bottom', () => {
    expect(bandInsertY('header', 794)).toBe(0);
    expect(bandInsertY('footer', 794)).toBe(762);
  });

  it('floors a pixel-derived height, so a full-width band item never lands off-sheet', () => {
    // 794.7 recovered from a ceil-inflated render must not push the item past
    // the page edge, where band items render silently.
    expect(bandInsertY('footer', 794.7)).toBe(762);
  });

  it('degrades to the top rather than authoring a nonsense coordinate', () => {
    expect(bandInsertY('footer', Number.NaN)).toBe(0);
    expect(bandInsertY('footer', 10)).toBe(0);
  });

  it('authors a page number with NOTHING the reader did not choose', () => {
    // Serialize the ITEM alone: a template-level check would trip on the other
    // structs' injected defaults, not on this snippet's.
    const editor = Editor.create(['sections:', '  body:', '    items: []', ''].join('\n'));
    const placed = bandPlaced(insertSnippet('pageNumber', ''), 762);
    expect(
      editor.apply({ op: 'insertItem', path: BODY_ITEMS_PATH, index: 0, value: placed }).ok,
    ).toBe(true);
    const text = editor.text();
    // The pattern key is absent — the engine's own default is the value — and
    // the box carries only the three keys a band placement needs. NO height:
    // a definite one is what `text_overflow` measures against.
    expect(text).not.toContain('format:');
    expect(text).toContain('type: page_number');
    for (const key of ['x: 0', 'y: 762', 'w: 100%']) {
      expect(text).toContain(key);
    }
    expect(text).not.toContain('h:');
  });

  it('adds coordinates to a text-shaped snippet and NO height', () => {
    // A definite `h` is what `text_overflow` measures against, so any fixed
    // default is a promise about the document's font. The blank presets set
    // 10.5pt, which at the engine's 1.4 line height is a 14.7pt line box —
    // taller than the 14pt this used to author, so the first page number a
    // reader inserted warned on every blank-start document.
    expect(bandPlaced(insertSnippet('pageNumber', ''), 762)).toEqual({
      type: 'page_number',
      box: { w: '100%', x: 0, y: 762 },
    });
  });

  it('gives a box-less flow snippet the band form it needs, height still absent', () => {
    expect(bandPlaced(insertSnippet('text', 'テキスト'), 0)).toEqual({
      type: 'text',
      text: 'テキスト',
      box: { w: '100%', x: 0, y: 0 },
    });
  });

  it('places a BOXLESS item through its own endpoints, never a box', () => {
    // `LineItem` is `deny_unknown_fields` with no `box` field, so authoring one
    // is a parse error rather than a misplacement. A header offset of 0 leaves
    // the endpoints exactly as the snippet wrote them.
    const placed = bandPlaced(insertSnippet('line', ''), 0);
    expect(placed).toEqual({
      type: 'line',
      from: { x: 0, y: RULE_Y_PT },
      to: { x: '100%', y: RULE_Y_PT },
    });
    expect(placed).not.toHaveProperty('box');
  });

  it('moves a boxless item down the page by shifting BOTH endpoints', () => {
    // What puts a footer rule where footers print. `x` is untouched — the band
    // offset is vertical — and the `100%` end keeps its Length form.
    expect(bandPlaced(insertSnippet('line', ''), 700)).toEqual({
      type: 'line',
      from: { x: 0, y: RULE_Y_PT + 700 },
      to: { x: '100%', y: RULE_Y_PT + 700 },
    });
  });

  it('serializes a band-placed rule with no box key in the file', () => {
    // The end-to-end proof of the parse-error class: read the authored TEXT,
    // not just the object the placer returned.
    const editor = Editor.create(['sections:', '  body:', '    items: []', ''].join('\n'));
    const placed = bandPlaced(insertSnippet('line', ''), 700);
    expect(
      editor.apply({ op: 'insertItem', path: BODY_ITEMS_PATH, index: 0, value: placed }).ok,
    ).toBe(true);
    const text = editor.text();
    expect(text).toContain('type: line');
    expect(text).not.toContain('box:');
  });

  it('leaves the OTHER boxless type alone — it has no endpoints to shift', () => {
    // `page_break` takes only `id`. Neither key may be invented for it, and
    // an authored `from: null` would be as much a parse error as a box.
    const placed = bandPlaced({ type: 'page_break' }, 700);
    expect(placed).toEqual({ type: 'page_break' });
    expect(placed).not.toHaveProperty('from');
    expect(placed).not.toHaveProperty('to');
  });

  it('leaves an endpoint it cannot arithmetically move exactly as authored', () => {
    // These arrive from `useBlocks`, which band-places user-saved blocks
    // restored from browser storage — so the shapes are the USER's, not this
    // module's own snippets.
    //
    // A `Length` STRING is the one that would corrupt silently: `'50%' + 700`
    // is `'50%700'`, which the engine then rejects.
    expect(
      bandPlaced({ type: 'line', from: { x: 0, y: '50%' }, to: { x: '100%', y: 4 } }, 700),
    ).toEqual({
      type: 'line',
      from: { x: 0, y: '50%' },
      to: { x: '100%', y: 704 },
    });
    // An ANCHORED endpoint has no coordinate at all — the line runs to whatever
    // the target item's placement turns out to be.
    expect(bandPlaced({ type: 'line', from: { item: 'total' }, to: { x: 0, y: 0 } }, 700)).toEqual({
      type: 'line',
      from: { item: 'total' },
      to: { x: 0, y: 700 },
    });
  });

  it('degrades on a hostile endpoint rather than throwing', () => {
    for (const bad of ['a string', null, [1, 2], 42]) {
      const placed = bandPlaced({ type: 'line', from: bad, to: bad } as never, 700);
      expect(placed).toEqual({ type: 'line', from: bad, to: bad });
    }
    // A line with no endpoints at all: nothing is invented for it.
    expect(bandPlaced({ type: 'line' } as never, 700)).toEqual({ type: 'line' });
  });

  it('keeps a document-supplied __proto__ inert on both the item and an endpoint', () => {
    // Own-property spreads only, so a restored block carrying the key copies it
    // as data and never reaches Object.prototype.
    const hostile = JSON.parse(
      '{"type":"line","__proto__":{"polluted":1},"from":{"x":0,"y":4,"__proto__":{"p":1}},"to":{"x":0,"y":4}}',
    );
    const placed = bandPlaced(hostile, 700) as Record<string, unknown>;
    // Inert means it travels as DATA, not that it is dropped: the spread makes
    // an own property, so nothing reaches Object.prototype and the key is
    // handed back to the engine to reject like any other unknown field.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).p).toBeUndefined();
    expect(Object.getPrototypeOf(placed)).toBe(Object.prototype);
    expect(Object.hasOwn(placed, '__proto__')).toBe(true);
    const from = placed.from as Record<string, unknown>;
    expect(Object.getPrototypeOf(from)).toBe(Object.prototype);
    // The shift still happened around the hostile key.
    expect(from.x).toBe(0);
    expect(from.y).toBe(704);
    // A boxed item takes the same spread; pin it there too.
    const boxed = JSON.parse('{"type":"text","__proto__":{"polluted2":1}}');
    bandPlaced(boxed, 700);
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
  });

  it('keeps the height of a type that REQUIRES one', () => {
    // `rect` / `ellipse` / `image` / `qr_code` never lay out without an
    // authored `box.w`/`box.h` — they report `rect_missing_size` and friends
    // — so their own snippet size must survive. (Only `rect` and `qr_code`
    // are reachable from the insert menu; the other two arrive as blocks.)
    expect(bandPlaced(insertSnippet('rect', ''), 40)).toMatchObject({
      type: 'rect',
      box: { w: 120, h: 60, x: 0, y: 40 },
    });
    expect(bandPlaced(insertSnippet('qrCode', ''), 40)).toMatchObject({
      type: 'qr_code',
      box: { w: 60, h: 60, x: 0, y: 40 },
    });
  });
});
