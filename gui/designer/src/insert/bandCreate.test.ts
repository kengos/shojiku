import { Editor } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import { bandRegion } from '../canvas/reparentTarget';
import {
  activateBand,
  BAND_LABEL_KEYS,
  BAND_NAMES,
  bandActivateOps,
  bandCreateOp,
  bandExists,
  bandFromPath,
  bandPath,
  DEFAULT_BAND_HEIGHT_PT,
  DEFAULT_BAND_REPEAT,
} from './bandCreate';
import { bandInsertY, bandPlaced } from './bandPlacement';
import { resolveInsertTarget } from './model';

const BODY_ONLY = `version: 0.1.0
sections:
  body:
    type: flow
    items:
      - type: text
        text: hello
`;

const WITH_FOOTER = `version: 0.1.0
sections:
  body:
    type: flow
    items: []
  footer:
    height: 60
    items: []
`;

function editorOver(source: string) {
  return Editor.create(source);
}

const reader = (editor: Editor) => (path: string) => editor.read(path);

describe('bandPath / bandFromPath', () => {
  it('round-trips both bands', () => {
    for (const band of BAND_NAMES) {
      expect(bandFromPath(bandPath(band))).toBe(band);
    }
  });

  it('names the two bands in sections order', () => {
    expect(BAND_NAMES).toEqual(['header', 'footer']);
  });

  it('does not recognize a path INSIDE a band, nor the body', () => {
    expect(bandFromPath('sections.footer.items[0]')).toBeNull();
    expect(bandFromPath('sections.body')).toBeNull();
    expect(bandFromPath('')).toBeNull();
    expect(bandFromPath('__proto__')).toBeNull();
  });

  it('gives each band one shared label key', () => {
    expect(BAND_LABEL_KEYS.header).toBe('tree.section.header');
    expect(BAND_LABEL_KEYS.footer).toBe('tree.section.footer');
  });
});

describe('bandCreateOp', () => {
  it('authors exactly the three keys `Band` declares', () => {
    const op = bandCreateOp('footer');
    expect(op).toEqual({
      op: 'putValue',
      keys: ['sections', 'footer'],
      value: { repeat: DEFAULT_BAND_REPEAT, height: DEFAULT_BAND_HEIGHT_PT, items: [] },
    });
    // `Band` is deny_unknown_fields: a fourth key would be a parse error.
    expect(Object.keys(op.op === 'putValue' ? (op.value as object) : {})).toEqual([
      'repeat',
      'height',
      'items',
    ]);
  });

  it('carries the two load-bearing keys — an empty items list and a positive height', () => {
    const op = bandCreateOp('header');
    const value = op.op === 'putValue' ? (op.value as Record<string, unknown>) : {};
    expect(value.items).toEqual([]);
    expect(value.height).toBeGreaterThan(0);
  });
});

describe('bandExists', () => {
  it('is false for a band the document does not author', () => {
    const editor = editorOver(BODY_ONLY);
    expect(bandExists(reader(editor), 'footer')).toBe(false);
    expect(bandExists(reader(editor), 'header')).toBe(false);
  });

  it('is true for an authored band', () => {
    const editor = editorOver(WITH_FOOTER);
    expect(bandExists(reader(editor), 'footer')).toBe(true);
    expect(bandExists(reader(editor), 'header')).toBe(false);
  });

  it('reads a NON-MAP band as present rather than overwriting authored content', () => {
    const editor = editorOver(
      'version: 0.1.0\nsections:\n  body:\n    type: flow\n    items: []\n  footer: 3\n',
    );
    expect(bandExists(reader(editor), 'footer')).toBe(true);
    expect(bandActivateOps(reader(editor), 'footer')).toEqual([]);
  });
});

describe('bandActivateOps', () => {
  it('creates the band when it is absent', () => {
    const editor = editorOver(BODY_ONLY);
    expect(bandActivateOps(reader(editor), 'footer')).toEqual([bandCreateOp('footer')]);
  });

  it('authors NOTHING when the band already exists (no op, so no undo step)', () => {
    const editor = editorOver(WITH_FOOTER);
    expect(bandActivateOps(reader(editor), 'footer')).toEqual([]);
  });
});

describe('activateBand', () => {
  it('creates then selects on an absent band', () => {
    const editor = editorOver(BODY_ONLY);
    const select = vi.fn();
    activateBand('footer', reader(editor), (ops) => editor.applyAll(ops), select);
    expect(select).toHaveBeenCalledWith('sections.footer');
    expect(bandExists(reader(editor), 'footer')).toBe(true);
  });

  it('selects WITHOUT touching the document when the band is already there', () => {
    const editor = editorOver(WITH_FOOTER);
    const before = editor.text();
    const applyAll = vi.fn(() => ({ ok: true }) as const);
    const select = vi.fn();
    activateBand('footer', reader(editor), applyAll, select);
    expect(applyAll).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith('sections.footer');
    expect(editor.text()).toBe(before);
  });

  it('leaves the selection alone when the batch is refused', () => {
    const editor = editorOver(BODY_ONLY);
    const select = vi.fn();
    activateBand(
      'footer',
      reader(editor),
      () => ({ ok: false, error: { code: 'not_found' }, index: 0 }) as never,
      select,
    );
    expect(select).not.toHaveBeenCalled();
  });

  it('the created band is a real insert target and one undo reverts it whole', () => {
    const editor = editorOver(BODY_ONLY);
    const before = editor.text();
    activateBand('footer', reader(editor), (ops) => editor.applyAll(ops), vi.fn());
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.footer.items',
      index: 0,
      value: { type: 'page_number' },
    });
    expect(inserted.ok).toBe(true);
    editor.undo();
    editor.undo();
    expect(editor.text()).toBe(before);
  });
});

describe('the two load-bearing keys, each pinned by what it enables', () => {
  function created(band: 'header' | 'footer') {
    const editor = editorOver(BODY_ONLY);
    editor.applyAll(bandActivateOps(reader(editor), band));
    return editor;
  }

  it('`items: []` is what makes the band an insert TARGET', () => {
    // Without the list, `resolveInsertTarget` falls through to the body and
    // the page-number row stays greyed out with the band sitting right there.
    const editor = created('footer');
    expect(resolveInsertTarget(reader(editor), 'sections.footer').path).toBe(
      'sections.footer.items',
    );
  });

  it('the positive `height` is what makes the band a canvas DROP target', () => {
    const editor = created('footer');
    const A4 = { width: 595, height: 842 };
    const region = bandRegion(reader(editor), 'footer', A4, [24, 24, 24, 24]);
    expect(region).not.toBeNull();
    expect(region?.h).toBe(DEFAULT_BAND_HEIGHT_PT);
  });

  it('a band with no height is NOT a drop target — which is why 40 is authored', () => {
    const editor = editorOver(BODY_ONLY);
    editor.apply({ op: 'putValue', keys: ['sections', 'footer'], value: { items: [] } });
    expect(
      bandRegion(reader(editor), 'footer', { width: 595, height: 842 }, [24, 24, 24, 24]),
    ).toBeNull();
  });

  it('places a fresh band item inside the margin box on A4 AND on Letter', () => {
    // `bandInsertY` reads the margin-box height from the last-good render; a
    // freshly created band on a document that has never rendered has none, so
    // the fallback has to land inside the box on both papers.
    for (const marginBox of [794, 740]) {
      const y = bandInsertY('footer', marginBox);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(marginBox);
    }
    // A header item sits at the top of the box on either paper.
    expect(bandInsertY('header', 794)).toBe(0);
    expect(bandInsertY('header', 740)).toBe(0);
    // And the placed snippet carries the coordinates a band needs.
    const placed = bandPlaced({ type: 'page_number' }, bandInsertY('footer', 794)) as Record<
      string,
      unknown
    >;
    expect((placed.box as Record<string, unknown>).x).toBe(0);
  });
});

describe('what the created band does to the FILE', () => {
  it('round-trips: create, serialize, parse, and the text is a fixed point', () => {
    const editor = editorOver(BODY_ONLY);
    editor.applyAll(bandActivateOps(reader(editor), 'footer'));
    const once = editor.text();
    // Re-reading the serialized text and serializing again changes nothing.
    expect(Editor.create(once).text()).toBe(once);
    expect(once).toContain('footer:');
  });

  it('a created HEADER lands at the tail of `sections:`, after the body', () => {
    // `map.set` appends, and rebuilding the `sections:` map to reorder would
    // destroy the body's comments. Engine-identical, diff-unconventional —
    // asserted deliberately so the outcome is a decision, not a surprise.
    const editor = editorOver(BODY_ONLY);
    editor.applyAll(bandActivateOps(reader(editor), 'header'));
    const text = editor.text();
    expect(text.indexOf('header:')).toBeGreaterThan(text.indexOf('body:'));
  });

  it('ONE undo reverts the whole creation', () => {
    const editor = editorOver(BODY_ONLY);
    const before = editor.text();
    editor.applyAll(bandActivateOps(reader(editor), 'footer'));
    expect(editor.text()).not.toBe(before);
    editor.undo();
    expect(editor.text()).toBe(before);
  });
});
