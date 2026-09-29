// A table's two tabs as collapsible sections, through the real property panel:
// which section each tab opens at first, which sections a capability set
// withholds, that opening and closing authors nothing, what each section's `?`
// says in the arm where its control is absent, and the header-group list.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const PATH = 'sections.body.items[0]';
const NESTED = 'sections.body.items[0].items[0]';
/** A table whose parent list the read refuses (a hostile subtree). */
const THROWS = 'sections.body.items[1]';
const THROWING_PARENT = 'sections.body.items';
const TABLE = {
  type: 'table',
  data: { key: 'rows' },
  columns: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

function makeController(item: unknown, path = PATH): EditorController {
  const reads: Record<string, unknown> = {
    [path]: item,
    'sections.body': { type: 'flow', items: [item] },
    // The parent of `NESTED`: a container in the flow body.
    [PATH]: path === NESTED ? { type: 'container', items: [item] } : item,
  };
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (p: string) => {
      if (p === THROWING_PARENT && path === THROWS) {
        throw new Error('hostile subtree');
      }
      return reads[p];
    },
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(
  item: unknown = TABLE,
  options: {
    readonly capabilities?: readonly string[];
    readonly onSelectPath?: (path: string) => void;
    readonly onOpenColumnSheet?: () => void;
    readonly path?: string;
  } = {},
) {
  const path = options.path ?? PATH;
  const controller = makeController(item, path);
  render(
    <I18nProvider locale="en">
      <PropertyPanel
        controller={controller}
        path={path}
        capabilities={options.capabilities}
        onSelectPath={options.onSelectPath}
        onOpenColumnSheet={options.onOpenColumnSheet}
      />
    </I18nProvider>,
  );
  return controller;
}

function sections(): readonly (string | null)[] {
  return Array.from(document.querySelectorAll('[data-section]')).map((s) =>
    s.getAttribute('data-section'),
  );
}

function openSections(): readonly (string | null)[] {
  return Array.from(document.querySelectorAll('[data-section]'))
    .filter((s) => s.querySelector('[aria-expanded="true"]') !== null)
    .map((s) => s.getAttribute('data-section'));
}

function toggle(title: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${title}`) });
}

function styleTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
}

describe('the content tab', () => {
  it('lists the five sections in order and opens only the columns', () => {
    draw();
    expect(sections()).toEqual([
      'table.columns',
      'table.rows',
      'table.pages',
      'table.empty',
      'table.groups',
    ]);
    expect(openSections()).toEqual(['table.columns']);
  });

  it('summarises a closed section in its toggle', () => {
    draw({ ...TABLE, row: { height: 30 } });
    expect(toggle('Rows and cells').textContent).toContain('Row height fixed 30pt');
  });

  it('withholds the header-group section against an engine without groups', () => {
    draw(TABLE, { capabilities: ['table.row.height'] });
    expect(sections()).not.toContain('table.groups');
  });

  it('shows no page section when the panel cannot tell where the table sits', () => {
    // The parent list read throws: `pageMode` answers null, and a note there
    // would assert a render fact nobody established.
    draw(TABLE, { path: THROWS });
    expect(sections()).toContain('table.rows');
    expect(sections()).not.toContain('table.pages');
  });

  it('counts no columns on a table that carries no column list', () => {
    draw({ type: 'table' });
    expect(toggle('Columns').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle('Columns'));
    expect(toggle('Columns').textContent).toContain('Columns: 0');
  });

  it('opening and closing a section authors nothing', () => {
    const controller = draw();
    fireEvent.click(toggle('Rows and cells'));
    fireEvent.click(toggle('Rows and cells'));
    fireEvent.click(toggle('Columns'));
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('explains keep-together in the page help only when the switch is offered', () => {
    draw(TABLE, { capabilities: ['table.row.height'] });
    fireEvent.click(screen.getByRole('button', { name: 'About When the table crosses a page' }));
    expect(screen.queryByText(/Do not split the table:/)).toBeNull();
  });

  it('explains keep-together in the page help when the switch is there', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'About When the table crosses a page' }));
    expect(screen.getByText(/Do not split the table:/)).toBeTruthy();
  });

  it('gives a table inside a container the note, and no keep-together help', () => {
    // The engine draws it as one block there, so the switches — and the help
    // line for one of them — would describe something that cannot happen.
    draw(TABLE, { path: NESTED });
    expect(toggle('When the table crosses a page').textContent).toContain(
      'Does not cross pages (drawn as one block)',
    );
    fireEvent.click(screen.getByRole('button', { name: 'About When the table crosses a page' }));
    expect(screen.queryByText(/Do not split the table:/)).toBeNull();
  });

  it('mentions the column sheet in the columns help only when its button is there', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'About Columns' }));
    expect(screen.queryByText(/Edit in a sheet:/)).toBeNull();
  });

  it('mentions the column sheet when the host offers it', () => {
    draw(TABLE, { onOpenColumnSheet: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'About Columns' }));
    expect(screen.getByText(/Edit in a sheet: Compare the columns/)).toBeTruthy();
  });

  it('leads every rows-help line with the label of the field it explains', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'About Rows and cells' }));
    const text = screen.getByText(/Row height:/).textContent ?? '';
    expect(text).toMatch(/^Row height: /m);
    expect(text).toMatch(/^Header row height: /m);
    expect(text).toMatch(/^Cell padding: /m);
  });

  it('explains the row heights in the rows help only when they are offered', () => {
    draw(TABLE, { capabilities: [] });
    fireEvent.click(screen.getByRole('button', { name: 'About Rows and cells' }));
    expect(screen.queryByText(/Row height:/)).toBeNull();
    expect(screen.getByText(/Cell padding:/)).toBeTruthy();
  });

  it('explains the row heights when they are there', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'About Rows and cells' }));
    expect(screen.getByText(/Row height:/)).toBeTruthy();
  });

  it('explains the merge switch in the empty-data help only when it is offered', () => {
    draw(TABLE, { capabilities: [] });
    fireEvent.click(screen.getByRole('button', { name: 'About Blanks' }));
    expect(
      screen.queryByText(/Merge empty cells into the cell on their left: In a data row/),
    ).toBeNull();
  });

  it('explains the merge switch when it is there', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'About Blanks' }));
    expect(
      screen.getByText(/Merge empty cells into the cell on their left: In a data row/),
    ).toBeTruthy();
  });

  it('no longer carries a `?` of its own on any single switch', () => {
    // Their explanations moved into the section's one `?`.
    draw();
    fireEvent.click(toggle('When the table crosses a page'));
    fireEvent.click(toggle('Blanks'));
    for (const name of [
      'Do not split the table',
      'Merge empty cells into the cell on their left',
    ]) {
      const row = screen.getByRole('checkbox', { name }).closest('label')?.parentElement;
      expect(row?.querySelector('button')).toBeNull();
    }
  });
});

describe('the header-group list', () => {
  const GROUPED = {
    ...TABLE,
    headerGroups: [
      { label: 'Item', span: 2 },
      { label: '', span: 1 },
      { label: 'Late', span: 1 },
    ],
  };

  it('lists each group with the columns it really covers, and selects it on click', () => {
    const onSelectPath = vi.fn();
    draw(GROUPED, { onSelectPath });
    fireEvent.click(toggle('Header groups'));
    fireEvent.click(screen.getByRole('button', { name: 'Item Columns: 2' }));
    expect(onSelectPath).toHaveBeenCalledWith(`${PATH}.headerGroups[0]`);
    // An unnamed group still gets a row, so the indices stay true.
    fireEvent.click(screen.getByRole('button', { name: '(unnamed) Columns: 1' }));
    expect(onSelectPath).toHaveBeenCalledWith(`${PATH}.headerGroups[1]`);
    // Crowded out by the earlier groups: it covers nothing, and says so.
    expect(screen.getByRole('button', { name: 'Late Columns: 0' })).toBeTruthy();
  });

  it('lists nothing but the add button while there are no groups', () => {
    draw();
    fireEvent.click(toggle('Header groups'));
    const body = document.querySelector('[data-section="table.groups"]') as HTMLElement;
    expect(within(body).queryByRole('list')).toBeNull();
    expect(within(body).getByRole('button', { name: 'Add header group' })).toBeTruthy();
  });

  it('renders a hostile label as text and keeps it from widening the row', () => {
    draw({ ...TABLE, headerGroups: [{ label: '<b>x</b>'.repeat(40), span: 1 }] });
    fireEvent.click(toggle('Header groups'));
    const label = screen.getByText('<b>x</b>'.repeat(40));
    expect(document.querySelector('[data-section="table.groups"] b')).toBeNull();
    expect(label.className).toContain('truncate');
  });
});

describe('the decoration tab', () => {
  it('lists the six sections in order and opens only the table style', () => {
    draw();
    styleTab();
    expect(sections()).toEqual([
      'table.style',
      'table.border',
      'table.headerBand',
      'table.bodyBand',
      'table.conditions',
      'table.styleNames',
    ]);
    expect(openSections()).toEqual(['table.style']);
  });

  it('drops the flat tab heading for a table', () => {
    draw();
    styleTab();
    expect(screen.queryByRole('heading', { name: 'Style' })).toBeNull();
  });

  it('withholds every gated section against an engine with none of the keys', () => {
    draw(TABLE, { capabilities: [] });
    styleTab();
    expect(sections()).toEqual(['table.styleNames']);
  });

  // One key missing at a time: a section gated on the WRONG key would survive
  // the all-missing case above.
  const ALL = ['table.style', 'style.border', 'table.row.conditionalStyles'];
  it.each([
    ['table.style', ['table.style', 'table.headerBand', 'table.bodyBand']],
    ['style.border', ['table.border']],
    ['table.row.conditionalStyles', ['table.conditions']],
  ])('withholds only what %s gates', (key, gone) => {
    draw(TABLE, { capabilities: ALL.filter((k) => k !== key) });
    styleTab();
    const expected = [
      'table.style',
      'table.border',
      'table.headerBand',
      'table.bodyBand',
      'table.conditions',
      'table.styleNames',
    ].filter((id) => !gone.includes(id));
    expect(sections()).toEqual(expected);
  });

  it('keeps an ineffective fill visible and clearable without the table-style key', () => {
    // The swatch is the only way to see — and remove — a fill the engine does
    // not paint when the section's other controls are gated off.
    draw(
      { ...TABLE, style: { backgroundColor: '#ff0000' } },
      {
        capabilities: ['style.backgroundColor'],
      },
    );
    styleTab();
    expect(sections()).toEqual(['table.style', 'table.styleNames']);
    expect(screen.getByText('Background')).toBeTruthy();
    // The banner explaining the swatch renders here too, not only beside the
    // presets; the presets and switches the section help describes are absent.
    expect(screen.getByRole('button', { name: 'Remove the fill' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'About Table style' })).toBeNull();
  });

  it('hosts the border editor in the border section, as the table grid', () => {
    draw();
    styleTab();
    fireEvent.click(toggle('Border'));
    expect(
      screen.getByText(
        'On a table, one width for all sides is the grid between the cells; a per-side setting draws an outer frame instead.',
      ),
    ).toBeTruthy();
    // The editor's own `?` serves the section; the heading carries none.
    expect(screen.queryByRole('button', { name: 'About Border' })).toBeNull();
  });

  it('explains the hide-header switch only when the engine offers it', () => {
    draw(TABLE, { capabilities: ['table.style'] });
    styleTab();
    fireEvent.click(screen.getByRole('button', { name: 'About Table style' }));
    expect(screen.queryByText(/Hide the header row on the page:/)).toBeNull();
  });

  it('explains the hide-header switch when it is there', () => {
    draw();
    styleTab();
    fireEvent.click(screen.getByRole('button', { name: 'About Table style' }));
    expect(screen.getByText(/Hide the header row on the page:/)).toBeTruthy();
  });

  it('summarises the rule count and the named styles while closed', () => {
    draw({ ...TABLE, styleNames: ['ruled'], row: { conditionalStyles: [{ when: { key: 'a' } }] } });
    styleTab();
    expect(toggle('Conditional formatting').textContent).toContain('Rules: 1');
    expect(toggle('Named styles').textContent).toContain('ruled');
  });
});
