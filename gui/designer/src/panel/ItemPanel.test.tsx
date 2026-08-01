import { describe, expect, it } from 'vitest';
import { applicableTabs } from './ItemPanel';
import { readItemView } from './itemView';

/** The tab set for one wire item type. `applicableTabs` is the panel's TYPE
 * GATE: a kind missing from it has no editing surface at all, which is how an
 * insertable item ships as a dead end — so each kind is pinned by name. */
function tabsOf(item: Record<string, unknown>): readonly string[] {
  const view = readItemView(item);
  if (view === null) {
    throw new Error('fixture must be a readable item view');
  }
  return applicableTabs(view);
}

describe('applicableTabs', () => {
  it('gives a text item all three tabs, in 内容→装飾→配置 order', () => {
    expect(tabsOf({ type: 'text', text: 'x' })).toEqual(['content', 'style', 'box']);
  });

  it('gives a rect no 内容 tab (pure chrome has nothing to edit there)', () => {
    expect(tabsOf({ type: 'rect' })).toEqual(['style', 'box']);
  });

  it('gives a line a 装飾 tab — its stroke must be reachable', () => {
    // A `line` is not a boxed item, but the insert menu creates dashed lines
    // and an insertable kind with no editing surface is a dead end.
    expect(tabsOf({ type: 'line' })).toContain('style');
  });

  it('gives a qr_code a 内容 tab, so its URL can be changed', () => {
    // An insertable QR whose reference could never be edited shipped once as a
    // dead end; this pins the tab that fixes it.
    expect(tabsOf({ type: 'qr_code' })).toContain('content');
  });

  it('gives the iterable kinds a 内容 tab, so their source can be rebound', () => {
    expect(tabsOf({ type: 'table' })).toContain('content');
    expect(tabsOf({ type: 'repeat_flow' })).toContain('content');
    expect(tabsOf({ type: 'list' })).toContain('content');
  });

  it('always offers 配置, whatever the type', () => {
    for (const type of ['text', 'rect', 'line', 'qr_code', 'image', 'page_number']) {
      expect(tabsOf({ type })).toContain('box');
    }
  });
});
