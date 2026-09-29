import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { GroupForm } from './GroupForm';
import type { GroupRow } from './groupModel';

const TABLE = 'sections.body.items[0]';
const GROUP_PATH = `${TABLE}.headerGroups[1]`;

const TABLE_NODE = {
  type: 'table',
  data: { key: 'rows' },
  headerGroups: [
    { label: 'Item', span: 2 },
    { label: 'Quantity', span: 3 },
    { label: 'Amount', span: 1 },
  ],
  columns: [
    { label: 'Name' },
    { label: 'Unit' },
    { label: 'Ordered' },
    { label: 'Shipped' },
    { label: 'Rest' },
    { label: 'Amount' },
  ],
};

const GROUPS: readonly GroupRow[] = [
  { label: 'Item', span: '2' },
  { label: 'Quantity', span: '3' },
  { label: 'Amount', span: '1' },
];

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

function form(
  controller: EditorController,
  index = 1,
  group: GroupRow = { label: 'Quantity', span: '3' },
  groups: readonly GroupRow[] = GROUPS,
  locale = 'en',
  onSelectPath?: (path: string) => void,
) {
  return render(
    <I18nProvider locale={locale}>
      <GroupForm
        controller={controller}
        path={GROUP_PATH}
        tablePath={TABLE}
        index={index}
        group={group}
        groups={groups}
        onSelectPath={onSelectPath}
        host={{ fontFamilies: [] }}
      />
    </I18nProvider>,
  );
}

describe('GroupForm', () => {
  it('names the columns the group actually spans, so a span edit shows its scope', () => {
    form(makeController({ [TABLE]: TABLE_NODE }));
    // The engine's own accumulation: the first group took Name+Unit, so this
    // one sits over the next three — joined for the reader's locale.
    expect(screen.getByText('Spans 3 columns: Ordered, Shipped, and Rest.')).toBeTruthy();
  });

  it('falls back to a column POSITION when a spanned column has no label', () => {
    const controller = makeController({
      [TABLE]: { ...TABLE_NODE, columns: [{ label: 'Name' }, {}, {}, {}, {}, {}] },
    });
    form(controller);
    expect(screen.getByText('Spans 3 columns: 3, 4, and 5.')).toBeTruthy();
  });

  it('edits the label with one setScalar at the group path', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.blur(screen.getByLabelText('Group label'), { target: { value: 'Counts' } });
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: GROUP_PATH,
      keys: ['label'],
      value: 'Counts',
    });
  });

  it('does not dispatch on an unchanged label blur (tab-through safe)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.blur(screen.getByLabelText('Group label'), { target: { value: 'Quantity' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('commits a typed span as a NUMBER literal, one op', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.blur(screen.getByLabelText('Columns covered'), { target: { value: '2' } });
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: GROUP_PATH,
      keys: ['span'],
      value: 2,
    });
  });

  it('authors nothing for an emptied or unauthorable span (the key is required)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    // Re-queried every time, NOT captured once: a refusal now remounts the
    // input, so a held reference would be detached from the second blur on and
    // the rest of the cases would pass without ever reaching the handler.
    const span = () => screen.getByLabelText('Columns covered') as HTMLInputElement;
    const refuse = (value: string) => {
      fireEvent.blur(span(), { target: { value } });
      // Each refusal also takes its text back, leaving the authored span.
      expect(span().value).toBe('3');
    };
    refuse('');
    refuse('0');
    refuse('2.5');
    // Past the six columns the engine would clamp it anyway.
    refuse('9');
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('steps from the RESOLVED coverage, one op per click', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.click(screen.getByLabelText('Increase Columns covered'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: GROUP_PATH,
      keys: ['span'],
      value: 4,
    });
    fireEvent.click(screen.getByLabelText('Decrease Columns covered'));
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'setScalar',
      path: GROUP_PATH,
      keys: ['span'],
      value: 2,
    });
    expect(controller.apply).toHaveBeenCalledTimes(2);
  });

  it('disables the steppers and drops the hint for a group that covers nothing', () => {
    // The first group already takes every column, so this one is dropped by
    // layout (`header_group_span_clamped`) and has no coverage to report.
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller, 1, { label: 'Quantity', span: '3' }, [
      { label: 'Item', span: '6' },
      { label: 'Quantity', span: '3' },
    ]);
    expect(screen.getByLabelText('Increase Columns covered')).toHaveProperty('disabled', true);
    expect(screen.queryByText(/Spans/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Increase Columns covered'));
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('survives a table whose columns are absent or hostile', () => {
    const controller = makeController({ [TABLE]: { type: 'table', columns: 'nope' } });
    form(controller);
    // No columns to span, so no coverage and no hint — but the label field is
    // still editable.
    expect(screen.queryByText(/Spans/)).toBeNull();
    fireEvent.blur(screen.getByLabelText('Group label'), { target: { value: 'x' } });
    expect(controller.apply).toHaveBeenCalledTimes(1);
  });

  it('renders a document-derived label verbatim as text (React escapes it)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    const hostile = '<img src=x onerror=alert(1)>';
    form(controller, 1, { label: hostile, span: '3' });
    expect(screen.getByLabelText('Group label')).toHaveProperty('value', hostile);
    expect(document.querySelector('img')).toBeNull();
  });

  it('clips an unbounded column label in the hint (a glance aid, not a viewer)', () => {
    const long = 'x'.repeat(400);
    const controller = makeController({
      [TABLE]: { ...TABLE_NODE, columns: [{ label: 'a' }, { label: 'b' }, { label: long }] },
    });
    // Groups: Item spans 2 (a, b), Quantity spans 3 → clamped to the one
    // column left, the long-labelled one.
    form(controller);
    const hint = screen.getByText(/Spans/);
    expect(hint.textContent).toContain('…');
    expect(hint.textContent?.length).toBeLessThan(100);
  });
});

describe('GroupForm — removing the group', () => {
  it('removes a middle group and selects the one that slides into its slot', () => {
    const onSelectPath = vi.fn();
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller, 1, GROUPS[1], GROUPS, 'en', onSelectPath);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this group' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeItem',
      path: `${TABLE}.headerGroups`,
      index: 1,
    });
    expect(onSelectPath).toHaveBeenCalledWith(`${TABLE}.headerGroups[1]`);
  });

  it('removes the last group and selects the new last one', () => {
    const onSelectPath = vi.fn();
    form(makeController({ [TABLE]: TABLE_NODE }), 2, GROUPS[2], GROUPS, 'en', onSelectPath);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this group' }));
    expect(onSelectPath).toHaveBeenCalledWith(`${TABLE}.headerGroups[1]`);
  });

  it('removes the only group with its key and selects the table', () => {
    const onSelectPath = vi.fn();
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller, 0, GROUPS[0], [GROUPS[0]], 'en', onSelectPath);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this group' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: TABLE,
      keys: ['headerGroups'],
    });
    expect(onSelectPath).toHaveBeenCalledWith(TABLE);
  });

  it('removes without a selection callback, and keeps the selection after a refusal', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this group' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    const refused = makeController({ [TABLE]: TABLE_NODE });
    refused.apply = vi.fn(() => ({
      ok: false as const,
      error: { code: 'index_out_of_range' as const, message: 'x' },
    }));
    const onSelectPath = vi.fn();
    form(refused, 1, GROUPS[1], GROUPS, 'en', onSelectPath);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this group' })[1]);
    expect(onSelectPath).not.toHaveBeenCalled();
  });
});

describe('GroupForm — what a removal moves', () => {
  it('says the later groups move left, as the button description, before the click', () => {
    form(makeController({ [TABLE]: TABLE_NODE }), 1, GROUPS[1], GROUPS);
    const button = screen.getByRole('button', { name: 'Remove this group' });
    const note = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toBe('Groups after this one move left to fill its columns.');
  });

  it('says nothing for the last group, which moves nothing', () => {
    form(makeController({ [TABLE]: TABLE_NODE }), 2, GROUPS[2], GROUPS);
    expect(
      screen.getByRole('button', { name: 'Remove this group' }).getAttribute('aria-describedby'),
    ).toBeNull();
    expect(screen.queryByText(/move left/)).toBeNull();
  });

  it('says nothing for a group layout already drops, which covers no column', () => {
    const node = { ...TABLE_NODE, columns: [{ label: 'Name' }, { label: 'Unit' }] };
    form(makeController({ [TABLE]: node }), 1, GROUPS[1], GROUPS);
    expect(screen.queryByText(/move left/)).toBeNull();
  });
});

// A group's format: the table bands' controls at the group's own `style`, over
// the TABLE (not the header band — the engine resolves a group that way), with
// the band's fill shown as what sits beneath an unset group fill.
describe('GroupForm — the group’s format', () => {
  function styled(
    table: Record<string, unknown>,
    group: Record<string, unknown>,
    capabilities?: readonly string[],
  ) {
    const controller = makeController({ [TABLE]: table, [GROUP_PATH]: group });
    render(
      <I18nProvider locale="en">
        <GroupForm
          controller={controller}
          path={GROUP_PATH}
          tablePath={TABLE}
          index={1}
          group={{ label: 'Quantity', span: '3' }}
          groups={GROUPS}
          host={{ fontFamilies: [], capabilities }}
        />
      </I18nProvider>,
    );
    return controller;
  }

  it('authors bold at the GROUP’s own style', () => {
    const controller = styled(TABLE_NODE, TABLE_NODE.headerGroups[1]);
    // The positive control for the withheld case below.
    expect(screen.getByRole('heading', { name: 'Group format' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: GROUP_PATH,
      keys: ['style', 'fontWeight'],
      value: 'bold',
    });
  });

  it('shows what the TABLE gives it, not what the header band does', () => {
    styled(
      { ...TABLE_NODE, style: { fontStyle: 'italic' }, header: { style: { fontWeight: 'bold' } } },
      TABLE_NODE.headerGroups[1],
    );
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Italic' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' }).checked).toBe(false);
  });

  it('reports the engine’s header fill beneath an unset group fill', () => {
    styled(TABLE_NODE, TABLE_NODE.headerGroups[1]);
    expect(screen.getByText('#ededed')).toBeTruthy();
  });

  it('reports the engine’s #ededed beneath an unset group fill even when the header band sets one', () => {
    // The group row's band resolves from an EMPTY style
    // (engine/layout/src/engine/table/span.rs), so the header band's fill never
    // reaches it: this is what the page paints.
    styled(
      { ...TABLE_NODE, header: { style: { backgroundColor: '#dbe7ff' } } },
      TABLE_NODE.headerGroups[1],
    );
    expect(screen.getByText('#ededed')).toBeTruthy();
    expect(screen.queryByText('#dbe7ff')).toBeNull();
  });

  it('shows the group’s own fill once it has one', () => {
    styled(TABLE_NODE, { label: 'Quantity', span: 3, style: { backgroundColor: '#fff3bf' } });
    expect(screen.queryByText('#ededed')).toBeNull();
  });

  it('offers vertical alignment on a group — the engine honours it there', () => {
    styled(TABLE_NODE, TABLE_NODE.headerGroups[1]);
    expect(screen.getByRole('group', { name: 'Vertical alignment' })).toBeTruthy();
  });

  it('edits the group’s named styles behind its disclosure', () => {
    const controller = styled(TABLE_NODE, { label: 'Quantity', span: 3, styleNames: ['banner'] });
    fireEvent.click(screen.getByRole('button', { name: 'Named styles (1)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'banner' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: GROUP_PATH,
      keys: ['styleNames'],
    });
  });

  it('renders a hostile group node as unset controls rather than throwing', () => {
    for (const group of ['group', 7, ['x'], null]) {
      const { unmount } = render(
        <I18nProvider locale="en">
          <GroupForm
            controller={makeController({ [TABLE]: TABLE_NODE, [GROUP_PATH]: group })}
            path={GROUP_PATH}
            tablePath={TABLE}
            index={1}
            group={{ label: 'Quantity', span: '3' }}
            groups={GROUPS}
            host={{ fontFamilies: [] }}
          />
        </I18nProvider>,
      );
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' }).checked).toBe(false);
      expect(screen.getByRole('button', { name: 'Named styles' })).toBeTruthy();
      unmount();
    }
  });

  it('is withheld against an engine that does not paint a group’s own style', () => {
    styled(TABLE_NODE, TABLE_NODE.headerGroups[1], ['table.headerGroups']);
    expect(screen.queryByRole('heading', { name: 'Group format' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Bold' })).toBeNull();
    // The rest of the form is still there.
    expect(screen.getByRole('button', { name: 'Remove this group' })).toBeTruthy();
  });
});
