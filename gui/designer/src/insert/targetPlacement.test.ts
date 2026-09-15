// Tests for targetPlacement.ts — the one door an insert passes through before it
// is written: band-placed when the resolved target is a header or footer
// directly, the snippet untouched anywhere else.
import type { SnippetValue } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { LastGoodPreview } from '../preview/reducer';
import { insertSnippet } from './insertSnippet';
import { placeForTarget } from './targetPlacement';

/** A render whose margin box is exactly 800pt tall (1600px at scale 2, no margin). */
const PREVIEW = {
  pages: [{ width: 1000, height: 1600, rgba: new Uint8Array(0) }],
  inspect: { margin: [0, 0, 0, 0] },
  scale: 2,
} as unknown as LastGoodPreview;

const DOC: Record<string, unknown> = {
  'sections.body': { type: 'flow', items: [] },
  'sections.header': { items: [] },
  'sections.footer': { items: [{ type: 'container', items: [] }] },
  'sections.footer.items[0]': { type: 'container', items: [] },
};
const read = (path: string) => DOC[path];

describe('placeForTarget', () => {
  it('band-places a text into a footer one line above the bottom edge', () => {
    const placed = placeForTarget(read, PREVIEW, 'sections.footer.items', {
      type: 'text',
      text: 'x',
    });
    expect(placed).toEqual({ type: 'text', text: 'x', box: { w: '100%', x: 0, y: 768 } });
  });

  it('bottom-aligns a footer item that carries its own numeric height', () => {
    const image = { type: 'image', box: { w: 120, h: 100 }, src: 'a.png' } as SnippetValue;
    expect(placeForTarget(read, PREVIEW, 'sections.footer.items', image)).toEqual({
      type: 'image',
      box: { w: 120, h: 100, x: 0, y: 700 },
      src: 'a.png',
    });
  });

  it('bottom-aligns the fixed-height insert snippets by their own authored height', () => {
    // The wiring from the REAL snippets into the height rule: a snippet whose
    // `h` stopped being numeric would silently hang past the edge again.
    for (const [kind, h] of [
      ['rect', 60],
      ['qrCode', 60],
      ['ellipse', 40],
    ] as const) {
      const placed = placeForTarget(
        read,
        PREVIEW,
        'sections.footer.items',
        insertSnippet(kind, 'x'),
      );
      expect((placed as { box: { y: number } }).box.y, kind).toBe(800 - h);
    }
  });

  it('puts a header item at the top', () => {
    const placed = placeForTarget(read, PREVIEW, 'sections.header.items', {
      type: 'container',
      box: { direction: 'column' },
    } as SnippetValue);
    expect(placed).toEqual({
      type: 'container',
      box: { w: '100%', direction: 'column', x: 0, y: 0 },
    });
  });

  it('leaves the snippet untouched in the body and in a container inside a band', () => {
    const snippet = { type: 'image', box: { w: 120, h: 100 } } as SnippetValue;
    expect(placeForTarget(read, PREVIEW, 'sections.body.items', snippet)).toBe(snippet);
    expect(placeForTarget(read, PREVIEW, 'sections.footer.items[0].items', snippet)).toBe(snippet);
  });

  it('reads no height from a snippet whose box is not a map', () => {
    const odd = { type: 'text', box: 'garbage' } as unknown as SnippetValue;
    const placed = placeForTarget(read, PREVIEW, 'sections.footer.items', odd) as {
      box: Record<string, unknown>;
    };
    expect(placed.box.y).toBe(768);
  });
});
