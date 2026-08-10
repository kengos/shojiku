import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PickerOption } from './pickerModel';
import { RowConditionsSection } from './RowConditions';

const TABLE = 'sections.body.items[0]';

const OPTIONS: readonly PickerOption[] = [
  {
    key: 'kind',
    label: '行種別',
    type: 'string',
    sample: 'heading',
    enumValues: ['heading', 'end'],
  },
  { key: 'flagged', label: '要確認', type: 'boolean', sample: 'true', enumValues: [] },
  { key: 'note', label: '備考', type: 'string', sample: '', enumValues: [] },
  { key: 'qty', label: '数量', type: 'number', sample: '3', enumValues: [] },
];

function makeController(apply = vi.fn(() => ({ ok: true as const }))): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply,
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: () => undefined,
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

function section(entries: readonly unknown[], controller = makeController()) {
  draw(
    <RowConditionsSection
      path={TABLE}
      controller={controller}
      entries={entries}
      options={OPTIONS}
    />,
  );
  return controller;
}

describe('RowConditionsSection', () => {
  it('shows a one-line explanation and the add button when there are no rules', () => {
    section([]);
    expect(screen.getByText(/Change how certain rows look/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add a row condition' })).toBeTruthy();
  });

  it('summarizes each rule by its field LABEL and value without opening it', () => {
    section([{ when: { key: 'kind', equals: 'heading' } }, { when: { key: 'note', equals: 'x' } }]);
    expect(screen.getByRole('button', { name: 'When 行種別 is heading' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'When 備考 is x' })).toBeTruthy();
  });

  it('shows what a COLLAPSED rule does as chips, so the list reads unopened', () => {
    section([
      {
        when: { key: 'kind', equals: 'heading' },
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          backgroundColor: '#dbe7ff',
          color: '#222222',
        },
      },
    ]);
    for (const label of ['Center', 'Bold', 'Background', 'Color']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows no chips for a rule that sets no style yet', () => {
    section([{ when: { key: 'kind', equals: 'heading' } }]);
    expect(screen.queryByText('Center')).toBeNull();
    expect(screen.queryByText('Bold')).toBeNull();
  });

  it('hides the chips while the rule is open (its controls show the same)', () => {
    section([{ when: { key: 'kind' }, style: { textAlign: 'center' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    // Only the alignment RADIO remains — no chip duplicating it.
    expect(screen.getAllByText('Center')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Center' })).toBeTruthy();
  });

  it('summarizes an equals-less rule as a switch, not a comparison', () => {
    section([{ when: { key: 'flagged' } }]);
    expect(screen.getByRole('button', { name: 'When 要確認 is on' })).toBeTruthy();
  });

  it('names an unpicked field rather than showing an empty summary', () => {
    section([{ when: { key: '' } }]);
    expect(screen.getByRole('button', { name: 'When not set is on' })).toBeTruthy();
  });

  it('adds a rule as ONE op and opens it', () => {
    const controller = section([]);
    fireEvent.click(screen.getByRole('button', { name: '+ Add a row condition' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'putValue',
      path: TABLE,
      keys: ['row', 'conditionalStyles'],
      value: [{ when: { key: '' } }],
    });
  });

  it('removes a rule as ONE op', () => {
    const controller = section([{ when: { key: 'kind' } }, { when: { key: 'note' } }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this condition' })[0]);
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeItem',
      path: `${TABLE}.row.conditionalStyles`,
      index: 0,
    });
  });

  it('offers a declared enum as a select when the rule is expanded', () => {
    section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    const value = screen.getByLabelText('When the value is') as HTMLSelectElement;
    expect(value.tagName).toBe('SELECT');
    expect(Array.from(value.options).map((o) => o.value)).toEqual(['', 'heading', 'end']);
    expect(value.value).toBe('heading');
  });

  it('offers free entry for a field with no declared enum', () => {
    section([{ when: { key: 'note', equals: 'x' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is x' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    expect(value.tagName).toBe('INPUT');
    expect(value.value).toBe('x');
  });

  it('drops the value control entirely for a boolean field', () => {
    section([{ when: { key: 'flagged' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 要確認 is on' }));
    expect(screen.queryByLabelText('When the value is')).toBeNull();
    // The rest of the editor is still there.
    expect(screen.getByLabelText('Field to check')).toBeTruthy();
  });

  it('commits an alignment pick as ONE op', () => {
    const controller = section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Center' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
      value: 'center',
    });
  });

  it('commits bold ON as ONE op', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'fontWeight'],
      value: 'bold',
    });
  });

  it('commits bold OFF as ONE op that drops the emptied style map', () => {
    const controller = section([{ when: { key: 'kind' }, style: { fontWeight: 'bold' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'fontWeight'],
    });
  });

  it('repoints a rule at another field as ONE transactional batch', () => {
    const controller = section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    const key = screen.getByLabelText('Field to check') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'note' } });
    // A string-typed target keeps the equals: the value control stays
    // rendered, so the comparison remains visible and editable.
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'key'],
        value: 'note',
      },
    ]);
  });

  it('commits a value verbatim when the key matches no declared field', () => {
    // No picker option → no type to coerce with; the text is authored as is.
    const controller = section([{ when: { key: 'not_declared' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When not_declared is on' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    fireEvent.blur(value, { target: { value: '2' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: '2',
    });
  });

  it('repointing an equals-carrying rule at a boolean field also clears the equals', () => {
    // A boolean-form field renders no value control, so a kept `equals`
    // would be invisible AND still override the boolean read on the wire.
    // The two writes land as ONE transactional batch (one undo step).
    const controller = section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    const key = screen.getByLabelText('Field to check') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'flagged' } });
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'key'],
        value: 'flagged',
      },
      {
        op: 'removeKey',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'equals'],
      },
    ]);
  });

  it('repointing WITHOUT a stale equals batches only the key write', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    const key = screen.getByLabelText('Field to check') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'flagged' } });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'key'],
        value: 'flagged',
      },
    ]);
  });

  it('repointing at an UNDECLARED key keeps the equals (no type to reconcile with)', () => {
    const controller = section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    const key = screen.getByLabelText('Field to check') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'not_declared' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'key'],
        value: 'not_declared',
      },
    ]);
  });

  it('an externally-authored equals on a boolean field stays visible and clearable', () => {
    // The GUI never creates this state (repointing reconciles it), but a
    // hand-authored document can. The summary must read as the WIRE
    // behaves (a comparison, not a switch), and the value must be
    // clearable even though a clean boolean rule has no value control.
    const controller = section([{ when: { key: 'flagged', equals: 'yes' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 要確認 is yes' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    expect(value.value).toBe('yes');
    fireEvent.blur(value, { target: { value: '' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
    });
  });

  it('collapses an open rule again', () => {
    section([{ when: { key: 'kind' } }]);
    const summary = screen.getByRole('button', { name: 'When 行種別 is on' });
    fireEvent.click(summary);
    expect(screen.getByLabelText('Field to check')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close this condition' }));
    expect(screen.queryByLabelText('Field to check')).toBeNull();
  });

  it('renders a row for a hostile entry so the indices still line up', () => {
    section([null, { when: { key: 'kind' } }]);
    expect(screen.getAllByRole('button', { name: 'Remove this condition' })).toHaveLength(2);
  });
});

describe('RowConditionsSection — style controls', () => {
  it('commits a background color as ONE op', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Blue' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'backgroundColor'],
      value: '#1d4ed8',
    });
  });

  it('commits a text color as ONE op', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Blue' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'color'],
      value: '#1d4ed8',
    });
  });

  it('clears a color back to the cascade', () => {
    const controller = section([{ when: { key: 'kind' }, style: { backgroundColor: '#1d4ed8' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'backgroundColor'],
    });
  });

  it('clears the text color back to the cascade', () => {
    const controller = section([{ when: { key: 'kind' }, style: { color: '#1d4ed8' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'color'],
    });
  });

  it('switches an alignment to the newly picked one', () => {
    const controller = section([{ when: { key: 'kind' }, style: { textAlign: 'right' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Left' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
      value: 'left',
    });
  });

  it('falls back to free entry for a key the definitions do not declare', () => {
    // No picker option matches, so there is no type and no enum to offer.
    section([{ when: { key: 'not_declared', equals: 'x' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When not_declared is x' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    expect(value.tagName).toBe('INPUT');
  });

  it('says the value is not set when a hostile equals cannot be displayed', () => {
    section([{ when: { key: 'note', equals: { nested: 1 } } }]);
    expect(screen.getByRole('button', { name: 'When 備考 is not set' })).toBeTruthy();
  });

  it('reports the named styles a rule carries but does not edit', () => {
    section([{ when: { key: 'kind' }, styleNames: ['banner', 'loud'] }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    expect(screen.getByText('Also applies 2 named style(s)')).toBeTruthy();
  });

  it('says nothing about named styles when a rule carries none', () => {
    section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    expect(screen.queryByText(/named style/)).toBeNull();
  });

  it('commits a free-entry value on blur', () => {
    const controller = section([{ when: { key: 'note' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is on' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    fireEvent.blur(value, { target: { value: 'urgent' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'urgent',
    });
  });

  it('authors nothing when a free-entry value is blurred unchanged', () => {
    const controller = section([{ when: { key: 'note', equals: 'x' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is x' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    fireEvent.blur(value, { target: { value: 'x' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('authors a number literal when the picked field is numeric', () => {
    // The threading matters, not just the model fn: the card must hand the
    // picked field's TYPE to the commit.
    const controller = section([{ when: { key: 'qty' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 数量 is on' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    fireEvent.blur(value, { target: { value: '2' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 2,
    });
  });

  it('commits an enum pick', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is on' }));
    fireEvent.change(screen.getByLabelText('When the value is'), { target: { value: 'end' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'end',
    });
  });
});
