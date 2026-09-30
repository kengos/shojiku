import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { swatchLabel } from '../testkit/swatchLabel';
import type { PickerOption } from './pickerModel';
import { RowConditionsSection } from './RowConditions';
import type { ValignHost } from './TableBandFields';

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

function makeController(
  apply = vi.fn(() => ({ ok: true as const })),
  reads: Record<string, unknown> = {},
): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply,
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

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

function section(
  entries: readonly unknown[],
  controller = makeController(),
  floor?: Readonly<Record<string, unknown>>,
  verticalAlign: ValignHost = false,
) {
  draw(
    <RowConditionsSection
      path={TABLE}
      controller={controller}
      entries={entries}
      options={OPTIONS}
      floor={floor}
      host={{ fontFamilies: [], params: '', dataKey: 'rows', verticalAlign }}
    />,
  );
  return controller;
}

/** Open the one rule the fixture carries. */
function openRule(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('RowConditionsSection', () => {
  it('shows a one-line explanation and the add button when there are no rules', () => {
    section([]);
    expect(screen.getByText(/Change how certain rows look/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add a rule' })).toBeTruthy();
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

  it('rings the collapsed card’s colour dots, like every other colour chip', () => {
    section([{ when: { key: 'kind' }, style: { backgroundColor: '#ffffff', color: '#000000' } }]);
    const dots = [...document.querySelectorAll('span.size-2\\.5')] as HTMLElement[];
    expect(dots.map((d) => d.style.boxShadow)).toEqual([
      'inset 0 0 0 1px rgba(0, 0, 0, 0.45)',
      'inset 0 0 0 1px rgba(255, 255, 255, 0.55)',
    ]);
  });

  it('paints no colour for one the guard refuses, and marks the dot as unset', () => {
    // The value comes from an untrusted template, so it must reach no inline
    // colour. It used to reach no OUTLINE either, which left the dot invisible on
    // the dark surface — indistinguishable from a colour too dark to make out.
    // One call now decides both, so the two can no longer disagree.
    section([{ when: { key: 'kind' }, style: { backgroundColor: 'url(javascript:alert(1))' } }]);
    const dots = [...document.querySelectorAll('span.size-2\\.5')] as HTMLElement[];
    expect(dots).toHaveLength(1);
    expect(dots[0].style.backgroundColor).toBe('');
    expect(dots[0].style.boxShadow).toBe('inset 0 0 0 1px rgba(128, 128, 128, 0.9)');
  });

  it('labels its four style controls with the SHARED field vocabulary', () => {
    // These labels moved to the generic `panel.field.*` keys when the table's
    // band editor started using the same four properties — one wording wherever
    // they are edited. A covered line rendering a dead key is invisible to every
    // gate, so the strings are asserted, not just the render.
    section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    expect(screen.getByRole('group', { name: 'Text alignment' })).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Bold' })).not.toBeNull();
  });

  // The strip and the opened card answer two different questions — what
  // this rule ADDS, and what the matching rows RENDER with — and only the
  // second was ever labelled. A rule that adds nothing rendered as an absence,
  // which reads as "nothing happens here" right up until you open the card and
  // find Bold and Center checked (both inherited from the body band). The two
  // tests below are that exact pair, and the one at the foot of this file is
  // its other half.
  it('says a rule adds nothing, rather than showing an unexplained blank', () => {
    section([{ when: { key: 'kind', equals: 'heading' } }]);
    expect(screen.getByText('Adds no formatting of its own')).not.toBeNull();
    expect(screen.queryByText('Center')).toBeNull();
    expect(screen.queryByText('Bold')).toBeNull();
  });

  it('describes a rule control with its origin — the fourth band-editor host', () => {
    // `TableBandFields` renders in four places; a rule card is the one that is
    // not a table band. The origin rides the DESCRIPTION here as it does in the
    // bands, and only for a value the ENGINE floor supplied — a value the
    // document made earns the badge LINE instead, which is why this fixture
    // authors nothing above the rule.
    section([{ when: { key: 'kind', equals: 'heading' } }], makeController(), {
      textAlign: 'left',
      color: '#000000',
      fontWeight: 'normal',
    });
    openRule('When 行種別 is heading');
    const box = screen.getByRole('checkbox', { name: 'Bold' });
    const id = box.getAttribute('aria-describedby');
    expect(id).not.toBeNull();
    expect(document.getElementById(id as string)?.textContent).toBe('From document defaults');
  });

  it('counts a NAMED STYLE as something the rule adds, so "adds nothing" stays true', () => {
    // A names-only rule carries no `style.*` key, and `styleNames` was reported
    // only inside the opened card — so without its own chip the strip would
    // claim the rule adds nothing while the card said it applies one.
    section([{ when: { key: 'kind', equals: 'heading' }, styleNames: ['emphasis'] }]);
    expect(screen.queryByText('Adds no formatting of its own')).toBeNull();
    expect(screen.getByText('Adds')).not.toBeNull();
    expect(screen.getByText('Named style ×1')).not.toBeNull();
  });

  it('does not call a rule empty when it un-ticks Bold — the Designer authors that', () => {
    // `toggleWire` writes `fontWeight: normal` when you un-tick Bold over a
    // band that IS bold: a real edit, and the only reason such a rule exists.
    // Read through a `=== 'bold'` boolean it was indistinguishable from an
    // unset weight, so the strip called the rule empty one click after the
    // user acted — the same contradiction restated backwards, in words.
    section([{ when: { key: 'kind', equals: 'heading' }, style: { fontWeight: 'normal' } }]);
    expect(screen.queryByText('Adds no formatting of its own')).toBeNull();
    expect(screen.getByText('Not bold')).not.toBeNull();
  });

  it('does not call a rule empty for the Style keys the rule editor does not render', () => {
    // `Style` carries two dozen properties and the rule editor renders seven,
    // so "adds nothing" cannot be decided from the chips. An externally-authored
    // template carrying `opacity` is the ordinary case, not a hostile one.
    section([
      { when: { key: 'kind', equals: 'heading' }, style: { borderWidth: 1, opacity: 0.5 } },
    ]);
    expect(screen.queryByText('Adds no formatting of its own')).toBeNull();
    expect(screen.getByText('Other ×2')).not.toBeNull();
  });

  it('counts only the UNMODELLED remainder, so a rendered key is not double-reported', () => {
    section([
      {
        when: { key: 'kind', equals: 'heading' },
        style: { textAlign: 'center', opacity: 0.5 },
      },
    ]);
    expect(screen.getByText('Center')).not.toBeNull();
    expect(screen.getByText('Other ×1')).not.toBeNull();
  });

  it('shows italic, size and family as chips too — the rule editor edits them', () => {
    section([
      {
        when: { key: 'kind' },
        style: { fontStyle: 'italic', fontSize: 9, fontFamily: 'noto-sans', opacity: 0.5 },
      },
    ]);
    for (const chip of ['Italic', '9pt', 'noto-sans', 'Other ×1']) {
      expect(screen.getByText(chip)).toBeTruthy();
    }
  });

  it('shows an un-ticked inherited italic as a chip of its own', () => {
    section([{ when: { key: 'kind' }, style: { fontStyle: 'normal', fontSize: '1em' } }]);
    expect(screen.getByText('Not italic')).toBeTruthy();
    expect(screen.getByText('1em')).toBeTruthy();
    expect(screen.queryByText(/Other/)).toBeNull();
  });

  it('labels the chips as what the rule ADDS, not as what the row renders', () => {
    section([{ when: { key: 'kind' }, style: { textAlign: 'center', fontWeight: 'bold' } }]);
    expect(screen.getByText('Adds')).not.toBeNull();
    expect(screen.getByText('Center')).not.toBeNull();
    expect(screen.getByText('Bold')).not.toBeNull();
    expect(screen.queryByText('Adds no formatting of its own')).toBeNull();
  });

  it('shows an opened rule on its own, in place of the list', () => {
    section([{ when: { key: 'kind' }, style: { textAlign: 'center' } }, { when: { key: 'note' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    // No list row, no chip duplicating the alignment RADIO, no other rule.
    expect(screen.queryAllByRole('button', { name: 'Remove this rule' })).toHaveLength(0);
    expect(screen.getAllByText('Center')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Center' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /備考/ })).toBeNull();
    // The rule's sentence heads the view.
    expect(screen.getByText('When 行種別 is yes')).toBeTruthy();
  });

  it('summarizes a boolean `equals: true` as on, like the bare key', () => {
    section([{ when: { key: 'flagged', equals: true } }]);
    expect(screen.getByRole('button', { name: 'When 要確認 is yes' })).toBeTruthy();
  });

  it('names a field by its KEY when its definitions label is empty', () => {
    const options: readonly PickerOption[] = [
      { key: 'code', label: '', type: 'string', sample: '', enumValues: [] },
    ];
    draw(
      <RowConditionsSection
        path={TABLE}
        controller={makeController()}
        entries={[{ when: { key: 'code', equals: 'A' } }]}
        options={options}
        host={{ fontFamilies: [], params: '', dataKey: 'rows', verticalAlign: false }}
      />,
    );
    expect(screen.getByRole('button', { name: 'When code is A' })).toBeTruthy();
  });

  it('offers a long enum as a select rather than a wall of chips', () => {
    const many = Array.from({ length: 13 }, (_, i) => `v${i}`);
    const options: readonly PickerOption[] = [
      { key: 'kind', label: '行種別', type: 'string', sample: '', enumValues: many },
    ];
    const controller = makeController();
    draw(
      <RowConditionsSection
        path={TABLE}
        controller={controller}
        entries={[{ when: { key: 'kind', equals: 'v3' } }]}
        options={options}
        host={{ fontFamilies: [], params: '', dataKey: 'rows', verticalAlign: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is v3' }));
    const value = screen.getByLabelText('When the value is') as HTMLSelectElement;
    expect(value.tagName).toBe('SELECT');
    expect(value.options).toHaveLength(14);
    fireEvent.change(value, { target: { value: 'v12' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'v12',
    });
  });

  it('summarizes an equals-less rule as a switch, not a comparison', () => {
    section([{ when: { key: 'flagged' } }]);
    expect(screen.getByRole('button', { name: 'When 要確認 is yes' })).toBeTruthy();
  });

  it('names an unpicked field rather than showing an empty summary', () => {
    section([{ when: { key: '' } }]);
    expect(screen.getByRole('button', { name: 'When not set is yes' })).toBeTruthy();
  });

  it('adds a rule as ONE op and opens it', () => {
    const controller = section([]);
    fireEvent.click(screen.getByRole('button', { name: '+ Add a rule' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'putValue',
      path: TABLE,
      keys: ['row', 'conditionalStyles'],
      value: [{ when: { key: '' } }],
    });
  });

  it('removes a rule as ONE op — the TOP card is the last entry', () => {
    const controller = section([{ when: { key: 'kind' } }, { when: { key: 'note' } }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this rule' })[0]);
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeItem',
      path: `${TABLE}.row.conditionalStyles`,
      index: 1,
    });
  });

  it('offers a declared enum as value chips, the current one pressed', () => {
    const controller = section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    const group = screen.getByRole('group', { name: 'When the value is' });
    const heading = screen.getByRole('button', { name: 'heading' });
    expect(group.contains(heading)).toBe(true);
    expect(heading.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'end' }).getAttribute('aria-pressed')).toBe('false');
    // Pressing the chip already chosen authors nothing.
    fireEvent.click(heading);
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('offers free entry for a field with no declared enum', () => {
    section([{ when: { key: 'note', equals: 'x' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is x' }));
    const value = screen.getByLabelText('When the value is') as HTMLInputElement;
    expect(value.tagName).toBe('INPUT');
    expect(value.value).toBe('x');
  });

  it('leads the enum chips with "not set", pressed while no value is authored', () => {
    section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    expect(screen.getByRole('button', { name: 'not set' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'heading' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('takes a picked enum value back through "not set" — one removeKey', () => {
    const controller = section([{ when: { key: 'kind', equals: 'heading' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is heading' }));
    fireEvent.click(screen.getByRole('button', { name: 'not set' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
    });
  });

  it('shows a value outside the declared enum verbatim and pressed, so it can be replaced', () => {
    const controller = section([{ when: { key: 'kind', equals: 'legacy' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is legacy' }));
    expect(screen.getByRole('button', { name: 'legacy' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'end' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'end',
    });
  });

  it('offers a boolean field as on/off, reading the bare key as on', () => {
    section([{ when: { key: 'flagged' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 要確認 is yes' }));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Yes' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'No' }).checked).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'When the value is' })).toBeNull();
  });

  it('authors `equals: false` for off — a BOOLEAN, which the type-strict predicate needs', () => {
    const controller = section([{ when: { key: 'flagged' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 要確認 is yes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: false,
    });
  });

  it('reads `equals: false` as off and turns it on by removing the key', () => {
    const controller = section([{ when: { key: 'flagged', equals: false } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 要確認 is no' }));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'No' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
    });
  });

  it('keeps a QUOTED "false" on a boolean field as free entry — it is not the off state', () => {
    section([{ when: { key: 'flagged', equals: 'false' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 要確認 is false' }));
    expect(screen.queryByRole('radio', { name: 'No' })).toBeNull();
    expect((screen.getByLabelText('When the value is') as HTMLInputElement).value).toBe('false');
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
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'When not_declared is yes' }));
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
    // A boolean field's on/off cannot show `heading`, so a kept `equals`
    // would be hidden AND still override the boolean read on the wire.
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
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
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
    // clearable — the on/off a clean boolean rule gets cannot show `yes`.
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

  it('returns to the list from the back button and from Done, authoring nothing', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    for (const leave of ['‹ All rules', 'Done']) {
      fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
      expect(screen.getByLabelText('Field to check')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: leave }));
      expect(screen.queryByLabelText('Field to check')).toBeNull();
    }
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('shows the list when the open rule is gone (an undo took it away)', () => {
    const controller = makeController();
    const node = (entries: readonly unknown[]) => (
      <I18nProvider locale="en">
        <RowConditionsSection
          path={TABLE}
          controller={controller}
          entries={entries}
          options={OPTIONS}
          host={{ fontFamilies: [], params: '', dataKey: 'rows', verticalAlign: false }}
        />
      </I18nProvider>
    );
    const { rerender } = render(node([{ when: { key: 'kind' } }, { when: { key: 'note' } }]));
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is yes' }));
    rerender(node([{ when: { key: 'kind' } }]));
    expect(screen.queryByLabelText('Field to check')).toBeNull();
    expect(screen.getByRole('button', { name: 'When 行種別 is yes' })).toBeTruthy();
  });

  it('renders a row for a hostile entry so the indices still line up', () => {
    section([null, { when: { key: 'kind' } }]);
    expect(screen.getAllByRole('button', { name: 'Remove this rule' })).toHaveLength(2);
  });
});

describe('RowConditionsSection — style controls', () => {
  it('commits a background color as ONE op', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#1d4ed8') }));
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
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#1d4ed8') }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'color'],
      value: '#1d4ed8',
    });
  });

  it('clears a color back to the cascade', () => {
    const controller = section([{ when: { key: 'kind' }, style: { backgroundColor: '#1d4ed8' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'color'],
    });
  });

  // Picking LEFT with nothing below it does not author `textAlign: left` — the
  // cascade already yields left, so the minimal wire is to drop the own key.
  // (Behaviour CHANGE: the rule cards used to restate the default here, which is
  // what the header/body/column editors were fixed not to do.)
  it('reverts rather than restating the default when the pick is what the cascade gives', () => {
    const controller = section([{ when: { key: 'kind' }, style: { textAlign: 'right' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Left' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
    });
  });

  it('switches an alignment to the newly picked one', () => {
    const controller = section([{ when: { key: 'kind' }, style: { textAlign: 'right' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Center' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
      value: 'center',
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

  it('edits a rule’s named styles behind its disclosure, which names them while closed', () => {
    const controller = section([{ when: { key: 'kind' }, styleNames: ['banner', 'loud'] }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    const toggle = screen.getByRole('button', { name: 'Named styles (2)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('checkbox', { name: 'loud' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setStrings',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['styleNames'],
      values: ['banner'],
    });
  });

  it('says nothing about named styles when a rule carries none', () => {
    section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    expect(screen.getByRole('button', { name: 'Named styles' })).toBeTruthy();
    expect(screen.queryByText(/named style/)).toBeNull();
  });

  it('authors a new control — italic — at the RULE entry’s own style', () => {
    const controller = section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Italic' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'fontStyle'],
      value: 'italic',
    });
  });

  it('withholds vertical alignment where the engine does not honour a rule’s', () => {
    section([{ when: { key: 'kind' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    expect(screen.queryByRole('group', { name: 'Vertical alignment' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Italic' })).toBeTruthy();
  });

  it('offers vertical alignment over the body band’s, authoring at the rule’s own style', () => {
    const entries = [{ when: { key: 'kind' } }];
    const controller = section(
      entries,
      makeController(undefined, {
        [TABLE]: {
          type: 'table',
          row: { style: { verticalAlign: 'bottom' }, conditionalStyles: entries },
        },
      }),
      undefined,
      'table',
    );
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    // The rule sets none, so the band's `bottom` is what its rows render.
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Bottom' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Top' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'verticalAlign'],
      value: 'top',
    });
  });

  it('shows a rule’s vertical alignment as a chip, not as an unnamed remainder', () => {
    section([{ when: { key: 'kind' }, style: { verticalAlign: 'top', opacity: 0.5 } }]);
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Other ×1')).toBeTruthy();
  });

  it('shows an alignment spelling the label map lacks as itself, not as a catalog key', () => {
    section([
      { when: { key: 'kind' }, style: { textAlign: 'justify', verticalAlign: 'baseline' } },
    ]);
    expect(screen.getByText('justify')).toBeTruthy();
    expect(screen.getByText('baseline')).toBeTruthy();
    expect(screen.queryByText(/style\.value\./)).toBeNull();
  });

  it('commits a free-entry value on blur', () => {
    const controller = section([{ when: { key: 'note' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is yes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'When 数量 is yes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'end' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'end',
    });
  });
});

// A rule is one more LAYER over the body row, so its controls are the shared
// band fields over `rule → row band → table` and it inherits the same
// cascade-aware behaviour the header/body/column editors got. `alternateStyle`
// is deliberately not in that stack: the zebra applies to every other row, and
// the card shows one value.
describe('RowConditionsSection — a rule sits on the body band', () => {
  const TABLE_NODE = {
    type: 'table',
    style: { textAlign: 'center' },
    row: { style: { fontWeight: 'bold' }, alternateStyle: { fontWeight: 'normal' } },
  };
  const RULE = [{ when: { key: 'kind', equals: 'heading' } }];

  function withTable(entries: readonly unknown[] = RULE) {
    const controller = makeController(
      vi.fn(() => ({ ok: true as const })),
      {
        [TABLE]: TABLE_NODE,
      },
    );
    section(entries, controller);
    openRule('When 行種別 is heading');
    return controller;
  }

  it('is the same rule the collapsed strip called empty — and both now say so', () => {
    // The smoking gun, in one place: collapsed, this rule adds nothing; opened,
    // the controls show Bold and Center, because that is what the ROWS render.
    // Neither statement is wrong; before this they were merely unlabelled.
    withTable();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '‹ All rules' }));
    expect(screen.getByText('Adds no formatting of its own')).not.toBeNull();
  });

  it('shows what the matching rows render with, not only what the rule authors', () => {
    withTable();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Center' }).checked).toBe(true);
  });

  it('authors the override that actually turns an inherited bold off', () => {
    const controller = withTable();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'fontWeight'],
      value: 'normal',
    });
  });

  it('lets the rule’s own value beat the band’s, and reverts to it on re-pick', () => {
    const controller = withTable([
      { when: { key: 'kind', equals: 'heading' }, style: { textAlign: 'right' } },
    ]);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Right' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Center' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
    });
  });

  // Two inherited values here, so two lines: the alignment the TABLE supplies
  // and the weight the row BAND does.
  it('narrates where the inherited values came from', () => {
    withTable();
    expect(
      screen.queryAllByText('Effective').map((label) => label.closest('p')?.textContent ?? ''),
    ).toEqual([
      'Effective bold·Inherited from the level above',
      'Effective center·Inherited from the level above',
    ]);
  });
});

describe('RowConditionsSection — formatting presets and sample values', () => {
  it('applies a preset as ONE batch at the rule entry, and presses it once the wire matches', () => {
    const controller = section([{ when: { key: 'kind' }, style: { fontWeight: 'bold' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Red background, dark red text' }));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['style', 'backgroundColor'],
        value: '#f4c7c3',
      },
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['style', 'color'],
        value: '#a50e0e',
      },
      {
        op: 'removeKey',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['style', 'fontWeight'],
      },
    ]);
  });

  it('presses the preset the rule already carries, and re-picking it authors nothing', () => {
    const controller = section([{ when: { key: 'kind' }, style: { fontWeight: 'bold' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'When 行種別 is yes' }));
    const bold = screen.getByRole('button', { name: 'Bold text' });
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(bold);
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('offers the sample data’s values for a free-entry field as chips', () => {
    const controller = makeController();
    const params = JSON.stringify({
      rows: [{ note: 'rush' }, { note: 'hold' }, { note: 'rush' }, { note: 7 }],
    });
    draw(
      <RowConditionsSection
        path={TABLE}
        controller={controller}
        entries={[{ when: { key: 'note', equals: 'hold' } }]}
        options={OPTIONS}
        host={{ fontFamilies: [], params, dataKey: 'rows', verticalAlign: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'When 備考 is hold' }));
    const group = screen.getByRole('group', { name: 'Values in the sample data' });
    const chips = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
    expect(chips).toEqual(['rush', 'hold', '7']);
    fireEvent.click(screen.getByRole('button', { name: 'rush' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'rush',
    });
  });

  it('offers no sample chips for a rule with no field picked, or a table with no source', () => {
    const params = JSON.stringify({ rows: [{ note: 'rush' }] });
    const cases = [
      { entries: [{ when: { key: '' } }], dataKey: 'rows', name: 'When not set is yes' },
      { entries: [{ when: { key: 'note' } }], dataKey: '', name: 'When 備考 is yes' },
    ];
    for (const { entries, dataKey, name } of cases) {
      const { unmount } = draw(
        <RowConditionsSection
          path={TABLE}
          controller={makeController()}
          entries={entries}
          options={OPTIONS}
          host={{ fontFamilies: [], params, dataKey, verticalAlign: false }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.queryByRole('group', { name: 'Values in the sample data' })).toBeNull();
      unmount();
    }
  });
});
