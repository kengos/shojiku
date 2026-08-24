// Tests for bandPlacement.ts — which kinds are band-only, where a band
// item lands (floored pixel-derived heights), and the placed snippet shape.
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { bandInsertY, bandPlaced, requiresBand } from './bandPlacement';
import { insertSnippet } from './insertSnippet';
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
