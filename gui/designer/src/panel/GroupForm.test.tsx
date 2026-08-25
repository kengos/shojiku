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
    fireEvent.blur(screen.getByLabelText('Span (columns)'), { target: { value: '2' } });
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
    const span = () => screen.getByLabelText('Span (columns)') as HTMLInputElement;
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
    fireEvent.click(screen.getByLabelText('Increase'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: GROUP_PATH,
      keys: ['span'],
      value: 4,
    });
    fireEvent.click(screen.getByLabelText('Decrease'));
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
    expect(screen.getByLabelText('Increase')).toHaveProperty('disabled', true);
    expect(screen.queryByText(/Spans/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Increase'));
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
