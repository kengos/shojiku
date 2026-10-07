// The sectioned decoration tab of every non-table item, driven through
// PropertyPanel over a REAL editor — so an assertion reads what the file
// becomes, not an `apply()` payload. Covers which sections and controls each
// type is offered (only where the engine honours the key), each control's
// write, the capability gates, and the closed-section summaries.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

function doc(item: string, extra = ''): string {
  return `${extra}sections:
  body:
    type: flow
    items:
      - ${item}
`;
}

function Harness({
  text,
  capabilities,
  path = P,
}: {
  text: string;
  capabilities?: readonly string[];
  path?: string;
}) {
  const editor = useEditor(text);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={path} capabilities={capabilities} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

function open(text: string, capabilities?: readonly string[]) {
  render(<Harness text={text} capabilities={capabilities} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
}

const file = () => screen.getByTestId('doc').textContent ?? '';
/** The section toggles' titles, in order (a toggle is the heading's button,
 * carrying `aria-expanded`; its name is the title alone). */
const sectionTitles = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-expanded') && b.parentElement?.tagName === 'H3')
    .map((b) => b.querySelector('span')?.textContent);
const openSection = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const commit = (label: string, value: string) => {
  // By role: a section whose one field shares its title (Opacity) would make a
  // by-label query match the section's toggle too.
  const field = screen.getByRole('textbox', { name: label });
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

describe('which sections a type gets', () => {
  it('gives text every section, the text one open first', () => {
    open(doc('{ type: text, text: hi }'));
    expect(sectionTitles()).toEqual([
      'Text',
      'Vertical text & line breaks',
      'Overflow',
      'Fill and border',
      'Opacity',
      'Styles',
    ]);
    expect(screen.getByLabelText('Font size')).not.toBeNull();
    expect(screen.queryByLabelText('Background')).toBeNull();
  });

  it('gives a page number the same text set as a text item', () => {
    open(doc('{ type: page_number }'));
    expect(sectionTitles()).toEqual([
      'Text',
      'Vertical text & line breaks',
      'Overflow',
      'Fill and border',
      'Opacity',
      'Styles',
    ]);
    expect(screen.getByLabelText('Vertical alignment')).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Strikethrough' })).not.toBeNull();
  });

  it('gives a list its text, but no vertical alignment or overflow (entries ignore both)', () => {
    open(doc('{ type: list, data: { key: rows } }'));
    fireEvent.click(screen.getByRole('button', { name: 'About Text' }));
    expect(screen.getByText(/drawn on one line/)).not.toBeNull();
    expect(sectionTitles()).toEqual([
      'Text',
      'Vertical text & line breaks',
      'Fill and border',
      'Opacity',
      'Styles',
    ]);
    expect(screen.getByLabelText('Letter spacing')).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Strikethrough' })).not.toBeNull();
    expect(screen.queryByLabelText('Vertical alignment')).toBeNull();
  });

  it('gives a container the inherited text keys, explained, and its own overflow', () => {
    open(doc('{ type: container, items: [] }'));
    expect(sectionTitles()).toEqual([
      'Text',
      'Vertical text & line breaks',
      'Overflow',
      'Fill and border',
      'Opacity',
      'Styles',
    ]);
    openSection('Text');
    expect(screen.getByLabelText('Letter spacing')).not.toBeNull();
    // Not inherited, so nothing inside would ever draw them.
    expect(screen.queryByRole('checkbox', { name: 'Strikethrough' })).toBeNull();
    expect(screen.queryByLabelText('Vertical alignment')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About Text' }));
    expect(screen.getByText(/shows no text of its own/)).not.toBeNull();
    openSection('Overflow');
    expect(screen.getByLabelText('Content overflow')).not.toBeNull();
  });

  it('gives a char_grid its glyph keys, a fill without the border cluster, and opacity', () => {
    open(doc('{ type: char_grid, grid: { charsPerLine: 20, lines: 10 } }'));
    expect(sectionTitles()).toEqual(['Text', 'Fill', 'Opacity', 'Styles']);
    expect(screen.getByLabelText('Font family')).not.toBeNull();
    expect(screen.getByLabelText('Font size')).not.toBeNull();
    expect(screen.queryByLabelText('Text alignment')).toBeNull();
    expect(screen.queryByLabelText('Line height')).toBeNull();
    expect(screen.queryByLabelText('Letter spacing')).toBeNull();
    openSection('Fill');
    expect(screen.getByRole('button', { name: 'Background' })).not.toBeNull();
    expect(screen.queryByText('Border')).toBeNull();
    // The section's `?` names the grid section and tab by their own labels.
    fireEvent.click(screen.getByRole('button', { name: 'About Fill' }));
    expect(screen.getByText(/set in Manuscript grid on the Layout tab/)).not.toBeNull();
  });

  it('opens a container on its fill, not on the text it only hands down', () => {
    open(doc('{ type: container, items: [] }'));
    expect(screen.getByRole('button', { name: 'Background' })).not.toBeNull();
    expect(screen.queryByLabelText('Font size')).toBeNull();
  });

  it('opens a rect on its fill, with opacity and no text', () => {
    open(doc('{ type: rect, box: { w: 10, h: 10 } }'));
    expect(sectionTitles()).toEqual(['Fill and border', 'Opacity', 'Styles']);
    expect(screen.getByRole('button', { name: 'Background' })).not.toBeNull();
  });

  it('keeps a line on its own stroke, with no opacity section', () => {
    open(doc('{ type: line, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }'));
    expect(sectionTitles()).toEqual(['Line']);
  });

  it('keeps a form mark on its shape editor', () => {
    open(doc('{ type: checkbox, box: { w: 10, h: 10 } }'));
    expect(sectionTitles()).toEqual(['Fill and border', 'Opacity', 'Styles']);
    expect(screen.getByText('Outline')).not.toBeNull();
  });

  it('says a QR code’s opacity reaches its fill and border only', () => {
    open(doc('{ type: qr_code, text: q }'));
    fireEvent.click(screen.getByRole('button', { name: 'About Opacity' }));
    expect(screen.getByText(/only to this item's own fill and border/)).not.toBeNull();
  });

  it('withholds every gated control against an engine that lacks it', () => {
    open(doc('{ type: text, text: hi }'), []);
    expect(sectionTitles()).toEqual(['Text', 'Styles']);
    expect(screen.queryByLabelText('Letter spacing')).toBeNull();
    expect(screen.queryByLabelText('Vertical alignment')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Strikethrough' })).toBeNull();
  });

  it('keeps the border editor when only the fill is withheld', () => {
    open(doc('{ type: rect, box: { w: 10, h: 10 } }'), ['style.border']);
    expect(screen.queryByRole('button', { name: 'Background' })).toBeNull();
    expect(screen.getByText('Border')).not.toBeNull();
  });

  it('withholds an image’s opacity without the image capability', () => {
    open(doc('{ type: image, src: a.png }'), ['style.opacity', 'style.backgroundColor']);
    expect(sectionTitles()).not.toContain('Opacity');
  });

  it('offers an image’s opacity with it', () => {
    open(doc('{ type: image, src: a.png }'), ['style.opacity', 'image.opacity']);
    expect(sectionTitles()).toContain('Opacity');
  });
});

describe('the text-look controls write the item’s own style', () => {
  it('authors letter spacing, steps it by half a point, and refuses a percentage', () => {
    open(doc('{ type: text, text: hi }'));
    commit('Letter spacing', '10%');
    expect(file()).not.toContain('letterSpacing');
    commit('Letter spacing', '0.1em');
    expect(file()).toContain('letterSpacing: 0.1em');
    commit('Letter spacing', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Letter spacing' }));
    expect(file()).toContain('letterSpacing: 1.5');
    commit('Letter spacing', '');
    expect(file()).not.toContain('letterSpacing');
  });

  it('ticks underline and strikethrough together, and each off again', () => {
    open(doc('{ type: text, text: hi }'));
    const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
    fireEvent.click(box('Underline'));
    expect(file()).toContain('textDecoration: underline');
    fireEvent.click(box('Strikethrough'));
    expect(file()).toContain('textDecoration: underline line_through');
    expect(box('Underline').checked && box('Strikethrough').checked).toBe(true);
    fireEvent.click(box('Underline'));
    expect(file()).toContain('textDecoration: line_through');
    fireEvent.click(box('Strikethrough'));
    expect(file()).not.toContain('textDecoration');
  });

  it('keeps the two lines exclusive against an engine that takes one at a time', () => {
    open(doc('{ type: text, text: hi, style: { textDecoration: underline } }'), [
      'style.textDecoration',
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Strikethrough' }));
    expect(file()).toContain('textDecoration: line_through');
    expect(file()).not.toContain('underline');
  });

  it('switches off a line a named style supplies by writing none', () => {
    open(
      doc(
        '{ type: text, text: hi, styleNames: [link] }',
        'styles:\n  link: { textDecoration: underline }\n',
      ),
    );
    const underline = screen.getByRole('checkbox', { name: 'Underline' }) as HTMLInputElement;
    expect(underline.checked).toBe(true);
    // The origin line names the line in words, not the wire value.
    expect(screen.getByText('Underline', { selector: 'span.text-text' })).not.toBeNull();
    fireEvent.click(underline);
    expect(file()).toContain('textDecoration: none');
  });

  it('picks a vertical alignment and clears it', () => {
    open(doc('{ type: text, text: hi }'));
    fireEvent.change(screen.getByLabelText('Vertical alignment'), { target: { value: 'middle' } });
    expect(file()).toContain('verticalAlign: middle');
    fireEvent.change(screen.getByLabelText('Vertical alignment'), { target: { value: '' } });
    expect(file()).not.toContain('verticalAlign');
  });

  it('shows an authored value outside the list as itself, not as unset', () => {
    open(doc('{ type: text, text: hi, style: { verticalAlign: baseline } }'));
    const select = screen.getByLabelText('Vertical alignment') as HTMLSelectElement;
    expect(select.value).toBe('baseline');
    expect(within(select).getByRole('option', { name: 'baseline' })).not.toBeNull();
  });

  it('shows letter spacing inherited from a container, with where it came from', () => {
    render(
      <Harness
        text={`sections:
  body:
    type: flow
    items:
      - type: container
        style: { letterSpacing: 2 }
        items:
          - { type: text, text: hi }
`}
        path="sections.body.items[0].items[0]"
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    // The field shows the item's OWN value (none); the line under it says what
    // the page uses and where it comes from — the typography rows' idiom.
    expect((screen.getByLabelText('Letter spacing') as HTMLInputElement).value).toBe('');
    expect(screen.getAllByText('Inherited from the level above').length).toBeGreaterThan(0);
  });
});

describe('a table\u2019s letter spacing', () => {
  it('sets the letter spacing every cell inherits from the table text section', () => {
    open(doc('{ type: table, data: { key: rows }, columns: [] }'));
    fireEvent.click(screen.getByRole('button', { name: 'Text (whole table)' }));
    const field = screen.getByRole('textbox', { name: 'Letter spacing' });
    fireEvent.change(field, { target: { value: '1' } });
    fireEvent.blur(field);
    expect(file()).toContain('letterSpacing: 1');
    // The closed summary says so.
    fireEvent.click(screen.getByRole('button', { name: 'Text (whole table)' }));
    expect(screen.getByText('Letter spacing 1pt')).not.toBeNull();
    // A table draws no decoration line or vertical alignment of its own here.
    fireEvent.click(screen.getByRole('button', { name: 'Text (whole table)' }));
    expect(screen.queryByRole('checkbox', { name: 'Underline' })).toBeNull();
  });
});

describe('overflow', () => {
  it('picks how text that does not fit behaves, with clip behind its capability', () => {
    open(doc('{ type: text, text: hi }'));
    openSection('Overflow');
    const select = screen.getByLabelText('Text overflow') as HTMLSelectElement;
    expect(within(select).getByRole('option', { name: 'Cut off at the edge' })).not.toBeNull();
    fireEvent.change(select, { target: { value: 'ellipsis' } });
    expect(file()).toContain('textOverflow: ellipsis');
  });

  it('offers no clip against an engine without it', () => {
    open(doc('{ type: text, text: hi }'), ['style.textOverflow']);
    openSection('Overflow');
    const select = screen.getByLabelText('Text overflow');
    expect(within(select).queryByRole('option', { name: 'Cut off at the edge' })).toBeNull();
  });

  it('hides a container’s outside content', () => {
    open(doc('{ type: container, items: [] }'));
    openSection('Overflow');
    fireEvent.change(screen.getByLabelText('Content overflow'), {
      target: { value: 'hidden' },
    });
    expect(file()).toContain('overflow: hidden');
  });
});

describe('opacity', () => {
  it('authors the alpha from a percentage and steps it by ten', () => {
    open(doc('{ type: rect, box: { w: 10, h: 10 } }'));
    openSection('Opacity');
    commit('Opacity', '40');
    expect(file()).toContain('opacity: 0.4');
    expect((screen.getByRole('textbox', { name: 'Opacity' }) as HTMLInputElement).value).toBe('40');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Opacity' }));
    expect(file()).toContain('opacity: 0.3');
  });

  it('writes nothing when the shown value is only tabbed through', () => {
    const text = doc('{ type: rect, box: { w: 10, h: 10 }, style: { opacity: 0.333 } }');
    open(text);
    openSection('Opacity');
    const before = file();
    fireEvent.blur(screen.getByRole('textbox', { name: 'Opacity' }));
    commit('Opacity', '33.3');
    expect(file()).toBe(before);
  });

  it('steps down from fully opaque when unset', () => {
    open(doc('{ type: rect, box: { w: 10, h: 10 } }'));
    openSection('Opacity');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Opacity' }));
    expect(file()).toContain('opacity: 0.9');
  });

  it('names a named style as the source of an opacity it did not author', () => {
    open(
      doc(
        '{ type: rect, box: { w: 10, h: 10 }, styleNames: [faint] }',
        'styles:\n  faint: { opacity: 0.5 }\n',
      ),
    );
    openSection('Opacity');
    expect(screen.getByText('50%')).not.toBeNull();
  });
});

describe('closed-section summaries', () => {
  it('says what each closed section is set to', () => {
    open(
      doc(
        '{ type: text, text: hi, style: { textOverflow: shrink, opacity: 0.5, backgroundColor: "#eeeeee", borderWidth: 1 } }',
      ),
    );
    expect(screen.getByText('Shrink to fit')).not.toBeNull();
    expect(screen.getByText('50%')).not.toBeNull();
    expect(screen.getByText('Fill #eeeeee · Border on')).not.toBeNull();
  });

  it('names the new text keys in the closed text section', () => {
    render(
      <Harness
        text={doc(
          '{ type: text, text: hi, style: { letterSpacing: 2, textDecoration: underline, verticalAlign: middle } }',
        )}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.getByText('Middle · Letter spacing 2pt · Underline')).not.toBeNull();
  });

  it('says not set when nothing is authored', () => {
    open(doc('{ type: text, text: hi }'));
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(3);
  });
});
