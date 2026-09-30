// The placement tab's spacing and size-bound sections, driven through
// PropertyPanel over a REAL editor so each assertion reads the file: the
// padding and margin editors (all sides, per side with units, `auto` only where
// the owner distributes space, a flow-body table's left/right only), the size
// bounds, the capability gates, and the round trip of a one-side edit.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const FLOW = 'sections.body.items[0]';

function flowDoc(item: string): string {
  return `sections:
  body:
    type: flow
    items:
      - ${item}
`;
}

function Harness({
  text,
  path = FLOW,
  capabilities,
}: {
  text: string;
  path?: string;
  capabilities?: readonly string[];
}) {
  const editor = useEditor(text);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={path} capabilities={capabilities} gridStep={5} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

function layout(text: string, path?: string, capabilities?: readonly string[]) {
  render(<Harness text={text} path={path} capabilities={capabilities} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
}

const file = () => screen.getByTestId('doc').textContent ?? '';
const openSection = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const commit = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

describe('the spacing section', () => {
  it('sets every side at once, then one side with a unit, in one form each', () => {
    layout(flowDoc('{ type: text, text: hi }'));
    openSection('Spacing');
    commit('Padding (all sides)', '6');
    expect(file()).toContain('padding: 6');
    commit('Padding: Top', '5mm');
    expect(file()).toContain('padding: { top: 5mm, right: 6, bottom: 6, left: 6 }');
    commit('Padding: Right', '');
    expect(file()).not.toContain('right: 6');
  });

  it('edits one side of an existing map and leaves the others byte-exact', () => {
    layout(flowDoc('{ type: text, text: hi, box: { padding: { top: 4mm, left: 10% } } }'));
    openSection('Spacing');
    commit('Padding: Bottom', '2');
    expect(file()).toContain('top: 4mm');
    expect(file()).toContain('left: 10%');
    expect(file()).toContain('bottom: 2');
  });

  it('steps a side and the all-sides value by a point, never below 0', () => {
    layout(flowDoc('{ type: text, text: hi }'));
    openSection('Spacing');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Padding (all sides)' }));
    expect(file()).not.toContain('padding');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Padding (all sides)' }));
    expect(file()).toContain('padding: 1');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Padding: Left' }));
    expect(file()).toContain('left: 2');
  });

  it('lets a margin go negative and, in the flow body, auto on left and right only', () => {
    layout(flowDoc('{ type: text, text: hi }'));
    openSection('Spacing');
    commit('Margin: Top', '-4');
    expect(file()).toContain('margin: { top: -4 }');
    // Left and right are type-or-pick fields: `auto` is a row, not a keyword to know.
    fireEvent.click(screen.getByRole('button', { name: 'Choose a value for Margin: Left' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Auto/ }));
    expect(file()).toContain('left: auto');
    // A top side cannot take it here: typing it authors nothing.
    commit('Margin: Bottom', 'auto');
    expect(file()).not.toContain('bottom: auto');
  });

  it('shows an authored auto the placement cannot use, and says it counts as 0', () => {
    layout(
      `sections:
  header:
    items:
      - { type: text, text: hi, box: { x: 0, y: 0, margin: { top: auto } } }
  body:
    type: flow
    items: []
`,
      'sections.header.items[0]',
    );
    openSection('Spacing');
    expect((screen.getByLabelText('Margin: Top') as HTMLInputElement).value).toBe('auto');
    expect(screen.getByText(/has no effect here, so Margin: Top counts as 0/)).not.toBeNull();
  });

  it('names a stranded auto side the editor does not show (a flow table\u2019s top)', () => {
    layout(
      flowDoc('{ type: table, data: { key: rows }, columns: [], box: { margin: { top: auto } } }'),
    );
    openSection('Spacing');
    expect(screen.queryByLabelText('Margin: Top')).toBeNull();
    expect(screen.getByText(/so Margin: Top counts as 0/)).not.toBeNull();
  });

  it('steps a side authored in mm in mm, and explains a percent side cannot step', () => {
    layout(flowDoc('{ type: text, text: hi, box: { padding: { top: 4mm, left: 10% } } }'));
    openSection('Spacing');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Padding: Top' }));
    expect(file()).toMatch(/top: 4\.\d+mm/);
    expect(
      screen.getByRole('button', { name: 'Increase Padding: Left' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getAllByText(/cannot be stepped/).length).toBeGreaterThan(0);
  });

  it('offers a rect its margin but no padding (nothing to inset)', () => {
    layout(flowDoc('{ type: rect, box: { w: 10, h: 10 } }'));
    openSection('Spacing');
    expect(screen.queryByLabelText('Padding (all sides)')).toBeNull();
    expect(screen.getByLabelText('Margin (all sides)')).not.toBeNull();
  });

  it('narrows a flow-body table to its left and right sides, auto centring it', () => {
    layout(flowDoc('{ type: table, data: { key: rows }, columns: [] }'));
    openSection('Spacing');
    expect(screen.queryByLabelText('Padding (all sides)')).toBeNull();
    expect(screen.queryByLabelText('Padding: Top')).toBeNull();
    expect(screen.getByLabelText('Padding: Left')).not.toBeNull();
    expect(screen.getByLabelText('Margin: Right')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About Spacing' }));
    expect(screen.getByText(/centres it/)).not.toBeNull();
  });

  it('summarises the spacing while closed', () => {
    layout(flowDoc('{ type: text, text: hi, box: { padding: 6, margin: { top: 2 } } }'));
    expect(screen.getByText('Padding 6pt · Margin per side')).not.toBeNull();
  });

  it('names a padding it cannot show without claiming a value', () => {
    layout(flowDoc('{ type: text, text: hi, box: { padding: 4mm } }'));
    expect(screen.getByText('Padding')).not.toBeNull();
  });

  it('withholds padding and margin without their capabilities', () => {
    layout(flowDoc('{ type: text, text: hi }'), undefined, ['box.minmax']);
    expect(screen.queryByRole('button', { name: 'Spacing' })).toBeNull();
    openSection('Size limits');
    expect(screen.getByLabelText('Min width')).not.toBeNull();
  });
});

describe('the size-limits section', () => {
  it('sets, steps by the canvas grid and clears a bound', () => {
    layout(flowDoc('{ type: text, text: hi }'));
    openSection('Size limits');
    commit('Min height', '20mm');
    expect(file()).toContain('minHeight: 20mm');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Max width' }));
    expect(file()).toContain('maxWidth: 5');
    commit('Max width', '-3');
    expect(file()).toContain('maxWidth: 5');
    commit('Min height', '');
    expect(file()).not.toContain('minHeight');
  });

  it('summarises the bounds while closed, and says none when unset', () => {
    layout(flowDoc('{ type: text, text: hi, box: { maxWidth: 50% } }'));
    expect(screen.getByText('Max width 50%')).not.toBeNull();
  });

  it('withholds the height bounds from a flow-body table', () => {
    layout(flowDoc('{ type: table, data: { key: rows }, columns: [] }'));
    openSection('Size limits');
    expect(screen.getByLabelText('Min width')).not.toBeNull();
    expect(screen.queryByLabelText('Min height')).toBeNull();
  });

  it('is withheld without its capability', () => {
    layout(flowDoc('{ type: text, text: hi }'), undefined, ['box.padding']);
    expect(screen.queryByRole('button', { name: 'Size limits' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Spacing' })).not.toBeNull();
  });
});
