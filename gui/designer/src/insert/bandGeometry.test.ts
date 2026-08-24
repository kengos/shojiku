import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { bandBoxHeightPt, documentContentHeightPt } from './bandGeometry';
import { bandInsertY } from './bandPlacement';

const reader = (source: string) => {
  const editor = Editor.create(source);
  return (path: string) => editor.read(path);
};

const page = (body: string) =>
  `version: 0.1.0\n${body}sections:\n  body:\n    type: flow\n    items: []\n`;

/** The two shapes every blank preset ships as. */
const A4 = page('page:\n  size: A4\n  margin: 25\n\n');
const LETTER = page('page:\n  size: Letter\n  margin: 25\n\n');

describe('documentContentHeightPt', () => {
  it('resolves the blank presets exactly, without any render', () => {
    // A4 is 841.89pt tall, Letter 792 (engine/core/src/geometry.rs), and every
    // blank preset is margin 25.
    expect(documentContentHeightPt(reader(A4))).toBeCloseTo(791.89, 2);
    expect(documentContentHeightPt(reader(LETTER))).toBe(742);
  });

  it('follows the orientation', () => {
    const landscape = page('page:\n  size: A4\n  orientation: landscape\n  margin: 25\n\n');
    expect(documentContentHeightPt(reader(landscape))).toBeCloseTo(545.28, 2);
  });

  it('uses the engine default margin when the key is absent', () => {
    expect(documentContentHeightPt(reader(page('page:\n  size: Letter\n\n')))).toBe(742);
  });

  it('reads a per-side map and a unit string', () => {
    const sides = page('page:\n  size: Letter\n  margin: { top: 10, bottom: 20 }\n\n');
    expect(documentContentHeightPt(reader(sides))).toBe(762);
    const inches = page('page:\n  size: Letter\n  margin: { top: "1in", bottom: "1in" }\n\n');
    expect(documentContentHeightPt(reader(inches))).toBe(648);
  });

  it('says it does not know rather than guessing', () => {
    // A percentage resolves against a dimension this module deliberately does
    // not re-derive; an unrecognized size has no point dimensions at all.
    for (const source of [
      page('page:\n  size: Letter\n  margin: { top: "10%", bottom: 20 }\n\n'),
      page('page:\n  size: Postcard\n  margin: 25\n\n'),
    ]) {
      expect(documentContentHeightPt(reader(source))).toBeNull();
    }
  });

  it('reads a NON-MAP page as the engine defaults, like every other page reader', () => {
    // `readPageView` / `readMarginView` already define the Designer's answer
    // for a malformed `page:` — A4 at margin 25 — and this composes them rather
    // than inventing a second opinion. Such a document does not parse in the
    // engine anyway, so nothing is ever inserted into one.
    expect(documentContentHeightPt(reader(page('page: 7\n\n')))).toBeCloseTo(791.89, 2);
  });

  it('refuses a page whose margins swallow it whole', () => {
    expect(
      documentContentHeightPt(reader(page('page:\n  size: A5\n  margin: 400\n\n'))),
    ).toBeNull();
  });
});

describe('bandBoxHeightPt — the source a band insert actually places against', () => {
  it('places a footer INSIDE the margin box on Letter with no render at all', () => {
    // The regression this exists for: the render-derived reader answers a flat
    // 792 when nothing has rendered, which is A4-at-margin-25 exactly. On
    // Letter that is 50pt too large, and the item lands past the bottom of the
    // box with its line box off the 792pt sheet.
    const box = bandBoxHeightPt(null, reader(LETTER));
    expect(box).toBe(742);
    const y = bandInsertY('footer', box);
    expect(y).toBeLessThan(box);
    // ...and on the sheet: y is margin-box-relative, so add the top margin back.
    expect(25 + y + 14.7).toBeLessThan(792);
  });

  it('is still right on A4 with no render', () => {
    const box = bandBoxHeightPt(null, reader(A4));
    const y = bandInsertY('footer', box);
    expect(y).toBeLessThan(box);
    expect(25 + y + 14.7).toBeLessThan(841.89);
  });

  it('prefers the RENDER when there is one — it reports what the engine did', () => {
    const preview = { pages: [{ height: 1000, width: 600 }], scale: 2 } as never;
    expect(bandBoxHeightPt(preview, reader(LETTER))).toBe(500);
  });

  it('a render with no pages falls through to the document', () => {
    const empty = { pages: [], scale: 1 } as never;
    expect(bandBoxHeightPt(empty, reader(LETTER))).toBe(742);
  });

  it('answers NaN when neither source can say, so bandInsertY places at the top', () => {
    const unknown = page('page:\n  size: Postcard\n\n');
    expect(bandBoxHeightPt(null, reader(unknown))).toBeNaN();
    expect(bandInsertY('footer', bandBoxHeightPt(null, reader(unknown)))).toBe(0);
  });
});
