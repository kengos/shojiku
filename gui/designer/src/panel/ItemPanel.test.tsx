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

  it('gives a char_grid 内容 + 配置, so an inserted sheet can be retyped and placed', () => {
    // The insert menu creates one now, so this is the dead-end guard: no
    // 装飾 tab, because a char_grid's `borderWidth` is the GRID RULING width
    // rather than a border box, and the border cluster's per-side model would
    // author a different property under the same spelling.
    expect(tabsOf({ type: 'char_grid', grid: { charsPerLine: 20, lines: 10 } })).toEqual([
      'content',
      'box',
    ]);
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

  it('withholds 配置 from BOTH repeaters — the wire gives neither a `box:`', () => {
    // `RepeatItem` and `RepeatFlowItem` are `deny_unknown_fields` with no box
    // field, so a placement tab there authors a key that stops the whole
    // document parsing. `repeat` had that as its ONLY tab, which made the one
    // control the panel offered the one that breaks the file.
    expect(tabsOf({ type: 'repeat' })).toEqual([]);
    expect(tabsOf({ type: 'repeat_flow' })).toEqual(['content']);
  });

  it('is not fooled by a hostile type name', () => {
    // The gate reads real `Set`s, so a document string never walks a
    // prototype: `__proto__` and `constructor` are ordinary unknown types,
    // which get the box tab like any other boxed item.
    expect(tabsOf({ type: '__proto__' })).toEqual(['box']);
    expect(tabsOf({ type: 'constructor' })).toEqual(['box']);
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

function drawPanel(
  item: Record<string, unknown>,
  capabilities?: readonly string[],
  path: string = PATH,
) {
  return render(
    <I18nProvider locale="en">
      <PropertyPanel
        controller={makeController({ [path]: item })}
        path={path}
        capabilities={capabilities}
      />
    </I18nProvider>,
  );
}

describe('the text field says which keys it takes', () => {
  it('describes the editor with the key hint, without lengthening its name', () => {
    // The hint is out of sight until the field has focus (CSS), so a screen
    // reader is the ONLY reader it must reach unconditionally — as a
    // DESCRIPTION. Put in the naming element instead, it would be read out on
    // every reference to the field.
    drawPanel({ type: 'text', text: 'one' });
    const editor = screen.getByRole('textbox', { name: 'Text' });
    const described = editor.getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    const hint = document.getElementById(described ?? '');
    // The modifier is rendered per platform from ONE model (jsdom is not a Mac
    // user agent, so this is the non-Mac spelling); the catalogs carry `{mod}`
    // and no glyph, so a Windows reader is never shown a Command key.
    expect(hint?.textContent).toBe('Enter for a line break · Ctrl+Enter to finish');
  });

  it('gives the editor room for two lines', () => {
    // One line high was most of why a reader concluded the field could not
    // hold a break at all.
    drawPanel({ type: 'text', text: 'one' });
    const editor = screen.getByRole('textbox', { name: 'Text' });
    expect(editor.className).toContain('min-h-[3.6em]');
  });
});

describe('ItemPanel — box-less types', () => {
  it('gives a page_break the presence binding and still no tabs', () => {
    // The wire takes only `id` and `visible:`, so there is no TAB to show —
    // but a conditional page break is exactly what `visible:` is for, and the
    // panel used to say the type had nothing editable at all.
    drawPanel({ type: 'page_break' });
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.getByText('When to show')).toBeTruthy();
    expect(screen.queryByText('This element has no editable properties.')).toBeNull();
  });

  it('falls back to the no-editable placeholder when the engine lacks the key', () => {
    // An older engine parse-REJECTS `visible:`, so the control is withheld —
    // and a page_break then genuinely has nothing to edit again.
    drawPanel({ type: 'page_break' }, ['text']);
    expect(screen.getByText('This element has no editable properties.')).toBeTruthy();
    expect(screen.queryByText('When to show')).toBeNull();
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

describe('ItemPanel — the `visible:` capability gate', () => {
  it('offers the presence binding when the engine carries the key', () => {
    drawPanel({ type: 'text', text: 'x' }, ['item.visible']);
    expect(screen.getByText('When to show')).toBeTruthy();
  });

  it('withholds it when the engine does not', () => {
    // A gate that fails OPEN would write a key the engine rejects at parse.
    drawPanel({ type: 'text', text: 'x' }, ['text']);
    expect(screen.queryByText('When to show')).toBeNull();
  });

  it('offers it when no capability list is known (the bundled engine)', () => {
    drawPanel({ type: 'text', text: 'x' });
    expect(screen.getByText('When to show')).toBeTruthy();
  });
});

describe('ItemPanel — `visible:` inside a row scope', () => {
  const CELL = 'sections.body.items[0].cell.items[0]';

  function drawInCell(capabilities?: readonly string[]) {
    const controller = makeController({
      'sections.body.items[0]': { type: 'repeat', data: { key: 'rows' } },
      [CELL]: { type: 'text', text: 'x' },
    });
    return render(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={CELL} capabilities={capabilities} />
      </I18nProvider>,
    );
  }

  it('offers the presence binding on an item inside a repeat cell', () => {
    // The item's data scope is the bound ELEMENT here, not the document —
    // offering top-level fields at element scope would author a key that
    // resolves to nothing and hides the item with no diagnostic.
    drawInCell();
    expect(screen.getByText('When to show')).toBeTruthy();
  });

  it('still offers it when the engine cannot author a binding scope', () => {
    // Without `binding.scope` there is no second section to commit, so both
    // scopes go in one flat list rather than a section that cannot be picked.
    drawInCell(['item.visible']);
    expect(screen.getByText('When to show')).toBeTruthy();
  });
});

// GUI-41 — `visible:` is the rare, advanced setting. It stays OUTSIDE the tabs
// (it applies to every type and must not appear and disappear as the reader
// changes tab) but BELOW them: it used to head the panel, so selecting a
// rectangle opened on it, above the background and border controls.
describe('ItemPanel — where the presence binding sits', () => {
  /** DOM order of the tab BODY and the `visible:` heading, as the reader meets
   * them. `compareDocumentPosition` is what "below" MEANS in a document jsdom
   * never lays out.
   *
   * Against the TABLIST this would be a weaker claim than the requirement: a
   * layout rendering the section between the tab strip and the tab bodies also
   * follows the tablist, and that layout is the defect — the section would sit
   * above the background and border controls again. */
  function visibleComesAfterTabs(): boolean {
    const body = screen.getByRole('tabpanel');
    const heading = screen.getByText('When to show');
    return (body.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  it('renders it AFTER the tabs for a multi-tab item', () => {
    drawPanel({ type: 'rect' });
    expect(visibleComesAfterTabs()).toBe(true);
  });

  it('keeps it visible whichever tab is active', () => {
    drawPanel({ type: 'rect' });
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(screen.getByText('When to show')).toBeTruthy();
    expect(visibleComesAfterTabs()).toBe(true);
  });

  it('renders it after the body for a SINGLE-tab item, which shows no tablist', () => {
    // `repeat_flow` is a content type the border cluster does not decorate, and
    // the wire gives it no `box:` — so it gets exactly one tab and the tablist
    // chrome is dropped. (The fixture was `ellipse` before its presence became
    // content and its outline decoration; then `repeat`, back when the box tab
    // was wrongly offered to a type the engine parse-rejects it on. Both moves
    // were the SET changing, not this rule.)
    drawPanel({ type: 'repeat_flow' });
    expect(screen.queryAllByRole('tab')).toEqual([]);
    const heading = screen.getByText('When to show');
    const body = screen.getByText('Data source');
    expect((body.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
      true,
    );
  });
});

// A tab-less item's panel: a page break says what it does, a `repeat` does not
// claim to. Added after a zero-context PM read of the running app reported the
// page-break insert as "行き止まり" — nothing on the canvas moves except a page
// appearing in the rail, and the panel was one advanced control.
describe('ItemPanel — a type with no applicable tab', () => {
  it('tells the reader what a page break DOES', () => {
    drawPanel({ type: 'page_break' }, undefined, 'sections.body.items[1]');
    expect(screen.getByText('Everything after this starts on a new page.')).toBeTruthy();
    // Not INSTEAD of the presence binding — a conditional page break is
    // exactly what that key is for.
    expect(screen.getByText('When to show')).toBeTruthy();
  });

  it('says the break does NOTHING when it is the first thing in the body', () => {
    // The engine collapses a break at the top of an untouched page, so on a
    // blank document Insert ▸ Page break produces nothing at all — and the
    // general note would then be promising an effect the file does not have.
    // This is the state a reader is most likely to meet first.
    drawPanel({ type: 'page_break' }, undefined, 'sections.body.items[0]');
    expect(
      screen.getByText('Nothing comes before it, so this break does nothing yet.'),
    ).toBeTruthy();
    expect(screen.queryByText('Everything after this starts on a new page.')).toBeNull();
  });

  it('says nothing of the kind for a `repeat`, whose panel is INCOMPLETE', () => {
    // Its wire carries a data source, a cell sub-template and a grid, none of
    // which has a surface yet. A "that is all there is" note would be false,
    // and so would `panel.noEditable`.
    drawPanel({ type: 'repeat' });
    expect(screen.queryByText('Everything after this starts on a new page.')).toBeNull();
    expect(screen.queryByText('This element has no editable properties.')).toBeNull();
  });
});
