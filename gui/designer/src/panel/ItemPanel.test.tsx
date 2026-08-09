import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { applicableTabs } from './ItemPanel';
import { readItemView } from './itemView';
import { PropertyPanel } from './PropertyPanel';

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

  it('gives a line 装飾 + 配置 — its placement tab is the ENDPOINTS, not a box', () => {
    // A `box:` key on a line is an engine parse error (it draws from
    // `from`/`to`), so the placement tab must never carry the box fields —
    // but a line does have a position, and it is the only way to move one.
    expect(tabsOf({ type: 'line' })).toEqual(['style', 'box']);
  });

  it('gives a page_break NO tabs — the wire takes only `id`', () => {
    // Every field the panel could show would write a key the engine rejects;
    // the panel renders a placeholder for the empty set instead.
    expect(tabsOf({ type: 'page_break' })).toEqual([]);
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

  it('offers 配置 to every boxed type', () => {
    for (const type of ['text', 'rect', 'qr_code', 'image', 'page_number', 'table', 'container']) {
      expect(tabsOf({ type })).toContain('box');
    }
  });
});

/** A minimal controller over a fixed read map — the BoxSection suite's shape. */
function makeController(reads: Record<string, unknown>): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => reads[path],
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

const PATH = 'sections.body.items[0]';

function drawPanel(item: Record<string, unknown>) {
  return render(
    <I18nProvider locale="en">
      <PropertyPanel controller={makeController({ [PATH]: item })} path={PATH} />
    </I18nProvider>,
  );
}

describe('ItemPanel — box-less types', () => {
  it('renders the no-editable placeholder for a page_break, and no tabs', () => {
    drawPanel({ type: 'page_break' });
    expect(screen.getByText('This element has no editable properties.')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toEqual([]);
  });

  it('gives a line a placement tab carrying the endpoint fields, not the box fields', () => {
    drawPanel({ type: 'line', from: { x: 0, y: 2 }, to: { x: '100%', y: 2 }, style: {} });
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(screen.getByLabelText('Start X')).toBeTruthy();
    expect(screen.getByLabelText('End X')).toBeTruthy();
    // The box fields must be absent — authoring one is a parse error.
    expect(screen.queryByLabelText('X')).toBeNull();
    expect(screen.queryByLabelText('W')).toBeNull();
  });
});
