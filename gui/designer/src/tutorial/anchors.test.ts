import { describe, expect, it } from 'vitest';
import { anchorRect, TOUR_ANCHOR_IDS, TOUR_ANCHORS } from './anchors';

describe('the anchor registry', () => {
  it('lists every registered id', () => {
    expect(TOUR_ANCHOR_IDS).toContain(TOUR_ANCHORS.menuInsert);
    expect(TOUR_ANCHOR_IDS).toHaveLength(Object.keys(TOUR_ANCHORS).length);
  });

  it('keeps ids unique — two controls answering to one id would point at both', () => {
    expect(new Set(TOUR_ANCHOR_IDS).size).toBe(TOUR_ANCHOR_IDS.length);
  });
});

describe('anchorRect', () => {
  it('measures the element carrying the id', () => {
    const root = document.createElement('div');
    const el = document.createElement('button');
    el.setAttribute('data-tour', TOUR_ANCHORS.menuInsert);
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 30, height: 40 }) as DOMRect;
    root.append(el);
    expect(anchorRect(TOUR_ANCHORS.menuInsert, root)).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    });
  });

  it('returns null when the control is not mounted', () => {
    expect(anchorRect(TOUR_ANCHORS.containerPicker, document.createElement('div'))).toBeNull();
  });

  it('survives a hostile id instead of throwing a selector error', () => {
    const root = document.createElement('div');
    // Quotes and brackets would break an unescaped attribute selector.
    for (const id of ['a"]', "x'", '[', 'a b', '__proto__']) {
      expect(anchorRect(id, root)).toBeNull();
    }
  });

  it('finds an id that needs escaping when it really is on an element', () => {
    const root = document.createElement('div');
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'weird"id');
    el.getBoundingClientRect = () => ({ left: 1, top: 2, width: 3, height: 4 }) as DOMRect;
    root.append(el);
    expect(anchorRect('weird"id', root)).toEqual({ left: 1, top: 2, width: 3, height: 4 });
  });
});
