import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { buildStyleUsage } from '../styles/usage';
import { StylesManager } from './StylesManager';

/** A real-editor harness: an op mutates the document and re-renders, so tests
 * assert the serialized doc + the undo behavior (not a spy). `usageNull` forces
 * the null-usage path a rename/delete must refuse. */
function Harness({
  source,
  usageNull = false,
}: {
  readonly source: string;
  readonly usageNull?: boolean;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <StylesManager controller={editor} usage={usageNull ? null : buildStyleUsage(editor.text)} />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const STYLED = [
  'styles:',
  '  heading:',
  '    fontSize: 24',
  '  framed:',
  '    borderWidth: 1',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: hi',
  '        styleNames: [ heading ]',
  '',
].join('\n');

const doc = () => screen.getByTestId('doc').textContent ?? '';
const rows = () => screen.getAllByRole('listitem');

/** The row's face button — the only row button that is not the overflow menu's
 * trigger (Headless UI marks that one `aria-haspopup`). Clicking it opens the
 * style editor form. */
const rowBtn = (row: HTMLElement) =>
  within(row)
    .getAllByRole('button')
    .filter((el) => el.getAttribute('aria-haspopup') === null)[0];

/** The style name rendered in its own look — the row's preview chip. */
const chip = (row: HTMLElement, name: string) => within(row).getByText(name);

/** Open a row's overflow menu and pick an action, waiting out the menu's exit
 * so a following pick cannot match two menus at once. */
const pickRowAction = async (row: HTMLElement, name: string, action: string) => {
  fireEvent.click(within(row).getByRole('button', { name: `${name} actions` }));
  fireEvent.click(screen.getByRole('menuitem', { name: action }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
};

const renameForm = (row: HTMLElement, value: string) => {
  const input = within(row)
    .getAllByLabelText('Style name')
    .find((el) => (el as HTMLInputElement).value === value) as HTMLInputElement;
  return input;
};

describe('StylesManager', () => {
  it('renders each name through its own style on the shared paper tint', () => {
    render(
      <Harness
        source={[
          'styles:',
          '  strong:',
          '    fontWeight: bold',
          '    color: "#cc0000"',
          '  plain: {}',
          'sections:',
          '  body:',
          '    type: flow',
          '    items: []',
          '',
        ].join('\n')}
      />,
    );
    const strong = chip(rows()[0], 'strong');
    expect(strong.style.fontWeight).toBe('bold');
    expect(strong.style.color).toBe('rgb(204, 0, 0)');
    // The fixed paper tint every preview surface shares.
    expect(strong.className).toContain('bg-[#fcfcfa]');
    // A style that sets nothing previews plain — no inline props at all.
    const plain = chip(rows()[1], 'plain');
    expect(plain.style.length).toBe(0);
    expect(plain.className).toContain('bg-[#fcfcfa]');
  });

  it('shows a usage count on a used style and an edit invitation on an unused one', () => {
    render(<Harness source={STYLED} />);
    expect(within(rows()[0]).getByText('Used in 1 places')).toBeTruthy();
    expect(within(rows()[0]).queryByText('Click to edit')).toBeNull();
    expect(within(rows()[1]).getByText('Click to edit')).toBeTruthy();
    expect(within(rows()[1]).queryByText(/Used in/)).toBeNull();
  });

  it('points at where a style gets applied, but not on an empty registry', () => {
    render(<Harness source={STYLED} />);
    expect(
      screen.getByText('Apply a style to the selected item from the toolbar style picker.'),
    ).toBeTruthy();
  });

  it('opens a blank create form from the New style button and writes it in one undo step', () => {
    render(<Harness source={STYLED} />);
    fireEvent.click(screen.getByRole('button', { name: 'New style' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Style name'), { target: { value: 'boxed' } });
    fireEvent.blur(within(dialog).getByLabelText('Font size'), { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(doc()).toContain('boxed:');
    expect(doc()).toContain('fontSize: 9');
    // The whole create is one undo step.
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('boxed:');
  });

  it('opens the edit form seeded when a row is clicked, writing only the change', () => {
    render(<Harness source={STYLED} />);
    fireEvent.click(rowBtn(rows()[0]));
    const dialog = screen.getByRole('dialog');
    // Seeded from the style, name read-only (rename is the row menu).
    expect((within(dialog).getByLabelText('Font size') as HTMLInputElement).value).toBe('24');
    expect((within(dialog).getByLabelText(/Style name/) as HTMLInputElement).readOnly).toBe(true);
    fireEvent.blur(within(dialog).getByLabelText('Font size'), { target: { value: '30' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(doc()).toContain('fontSize: 30');
  });

  it('renames the registry AND its reference in ONE undo step', async () => {
    render(<Harness source={STYLED} />);
    await pickRowAction(rows()[0], 'heading', 'Rename');
    const input = renameForm(rows()[0], 'heading');
    fireEvent.change(input, { target: { value: 'title' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    // Registry key AND the styleNames reference both moved to `title`.
    expect(doc()).toContain('title:');
    expect(doc()).toContain('styleNames: [ title ]');
    expect(doc()).not.toContain('heading');
    // A single undo reverts the whole rename — registry and reference together.
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('heading:');
    expect(doc()).toContain('styleNames: [ heading ]');
    expect(doc()).not.toContain('title');
  });

  it('cancels a rename without changing anything', async () => {
    render(<Harness source={STYLED} />);
    const before = doc();
    await pickRowAction(rows()[0], 'heading', 'Rename');
    fireEvent.click(within(rows()[0]).getByText('Cancel'));
    expect(within(rows()[0]).queryAllByLabelText('Style name')).toHaveLength(0);
    expect(doc()).toBe(before);
  });

  it('deletes a USED style behind a two-step confirm (cancel is a no-op)', async () => {
    render(<Harness source={STYLED} />);
    const before = doc();
    await pickRowAction(rows()[0], 'heading', 'Delete');
    // The confirm shows the impact count first.
    const confirm = rows()[0].querySelector('.sj-style-confirm') as HTMLElement;
    expect(within(confirm).getByText(/Used in 1 places/)).toBeTruthy();
    // Cancel changes nothing.
    fireEvent.click(within(confirm).getByText('Cancel'));
    expect(doc()).toBe(before);
    // Confirm removes the registry entry AND strips the (now empty) reference.
    await pickRowAction(rows()[0], 'heading', 'Delete');
    const confirm2 = rows()[0].querySelector('.sj-style-confirm') as HTMLElement;
    fireEvent.click(within(confirm2).getByText('Delete'));
    expect(doc()).not.toContain('heading:');
    expect(doc()).not.toContain('styleNames:');
  });

  it('deletes an UNUSED style immediately (no confirm)', async () => {
    render(<Harness source={STYLED} />);
    await pickRowAction(rows()[1], 'framed', 'Delete');
    expect(doc()).not.toContain('framed:');
    // heading (the used one) is untouched.
    expect(doc()).toContain('heading:');
  });

  it('shows an empty state — and no apply hint — when there are no styles', () => {
    render(<Harness source={'sections:\n  body:\n    type: flow\n    items: []\n'} />);
    expect(screen.getByText('No styles defined yet.')).toBeTruthy();
    expect(screen.queryByText(/toolbar style picker/)).toBeNull();
  });

  it('refuses a rename when the usage index is null (unsafe to rewrite)', async () => {
    render(<Harness source={STYLED} usageNull />);
    const before = doc();
    await pickRowAction(rows()[0], 'heading', 'Rename');
    const input = renameForm(rows()[0], 'heading');
    fireEvent.change(input, { target: { value: 'title' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByText(/too large to rewrite references safely/)).toBeTruthy();
    expect(doc()).toBe(before);
  });

  it('renders a hostile style name as inert text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <Harness
        source={[
          'styles:',
          `  "${hostile}":`,
          '    fontSize: 12',
          'sections:',
          '  body:',
          '    type: flow',
          '    items: []',
          '',
        ].join('\n')}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(chip(rows()[0], hostile).textContent).toBe(hostile);
  });

  it('addresses a prototype-named style by its literal key through the form', () => {
    render(
      <Harness
        source={[
          'styles:',
          '  __proto__:',
          '    fontSize: 12',
          'sections:',
          '  body:',
          '    type: flow',
          '    items: []',
          '',
        ].join('\n')}
      />,
    );
    // The row renders (a Map/entry lookup, never a plain-object index).
    expect(chip(rows()[0], '__proto__').textContent).toBe('__proto__');
    fireEvent.click(rowBtn(rows()[0]));
    const dialog = screen.getByRole('dialog');
    fireEvent.blur(within(dialog).getByLabelText('Font size'), { target: { value: '14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(doc()).toContain('__proto__:');
    expect(doc()).toContain('fontSize: 14');
    expect(({} as Record<string, unknown>).fontSize).toBeUndefined();
  });

  it('drops hostile preview values instead of letting them reach the DOM', () => {
    render(
      <Harness
        source={[
          'styles:',
          '  huge:',
          '    fontSize: 1e300pt',
          '    color: "red; background-image: url(javascript:alert(1))"',
          'sections:',
          '  body:',
          '    type: flow',
          '    items: []',
          '',
        ].join('\n')}
      />,
    );
    const preview = chip(rows()[0], 'huge');
    // An unbounded/garbage length never reaches the DOM, and the CSSOM object
    // assignment cannot break out into a second declaration.
    expect(preview.style.fontSize).toBe('');
    expect(preview.style.backgroundImage).toBe('');
    expect(preview.getAttribute('style') ?? '').not.toContain('url(');
  });
});
