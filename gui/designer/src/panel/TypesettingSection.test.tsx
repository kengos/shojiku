// The vertical-text & line-break section of the decoration tab, driven through
// PropertyPanel over a REAL editor, so each assertion reads the file the pick
// produced: which keys each type shows, the vertical-only pair appearing with
// vertical writing (and staying while authored), the `{ digits: N }` map form
// both ways, the cascade's origin line, the capability gates, the circle note,
// and the closed summary.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';
const SECTION = 'Vertical text & line breaks';

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
  path,
}: {
  text: string;
  capabilities?: readonly string[];
  path: string;
}) {
  const editor = useEditor(text);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={path} capabilities={capabilities} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

function open(text: string, options: { capabilities?: readonly string[]; path?: string } = {}) {
  render(<Harness text={text} capabilities={options.capabilities} path={options.path ?? P} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
  fireEvent.click(screen.getByRole('button', { name: SECTION }));
}

const file = () => screen.getByTestId('doc').textContent ?? '';
const field = (name: string) =>
  screen.queryByRole('combobox', { name }) as HTMLSelectElement | null;
const pick = (name: string, value: string) => {
  const select = field(name);
  expect(select).not.toBeNull();
  fireEvent.change(select as HTMLSelectElement, { target: { value } });
};
const shownFields = () =>
  [
    'Writing direction',
    'Character orientation',
    'Horizontal in vertical',
    'Line-break rules',
    'Punctuation spacing',
    'Hanging punctuation',
  ].filter((name) => field(name) !== null);

describe('which keys a type shows', () => {
  it('shows a horizontal text the direction and the line-breaking three', () => {
    open(doc('{ type: text, text: hi }'));
    expect(shownFields()).toEqual([
      'Writing direction',
      'Line-break rules',
      'Punctuation spacing',
      'Hanging punctuation',
    ]);
  });

  it('adds the vertical-only pair once the text is vertical', () => {
    open(doc('{ type: text, text: hi }'));
    pick('Writing direction', 'vertical_rl');
    expect(file()).toContain('writingMode: vertical_rl');
    expect(shownFields()).toEqual([
      'Writing direction',
      'Character orientation',
      'Horizontal in vertical',
      'Line-break rules',
      'Punctuation spacing',
      'Hanging punctuation',
    ]);
  });

  it('shows a list only the direction while horizontal (its entries never wrap)', () => {
    open(doc('{ type: list, data: { key: rows } }'));
    expect(shownFields()).toEqual(['Writing direction']);
  });

  it('keeps hanging punctuation on horizontal spans while the item authors it', () => {
    open(doc('{ type: text, spans: [{ text: a }], style: { hangingPunctuation: allow_end } }'));
    expect(field('Hanging punctuation')?.value).toBe('allow_end');
    pick('Hanging punctuation', '');
    expect(file()).not.toContain('hangingPunctuation');
    expect(field('Hanging punctuation')).toBeNull();
  });

  it('drops hanging punctuation from horizontal spans', () => {
    open(doc('{ type: text, spans: [{ text: a }] }'));
    expect(field('Hanging punctuation')).toBeNull();
    expect(field('Line-break rules')).not.toBeNull();
  });

  it('gives no section to a char_grid, which takes its own grid settings', () => {
    render(
      <Harness text={doc('{ type: char_grid, grid: { charsPerLine: 20, lines: 10 } }')} path={P} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.queryByRole('button', { name: SECTION })).toBeNull();
  });

  it('explains that a container hands its settings to the text inside', () => {
    open(doc('{ type: container, items: [] }'));
    fireEvent.click(screen.getByRole('button', { name: `About ${SECTION}` }));
    expect(screen.getByText(/text inside this container/)).not.toBeNull();
    pick('Line-break rules', 'strict');
    expect(file()).toContain('lineBreak: strict');
  });

  it('sets a table’s direction for every cell, from its own section', () => {
    open(doc('{ type: table, data: { key: rows }, columns: [] }'));
    fireEvent.click(screen.getByRole('button', { name: `About ${SECTION}` }));
    expect(screen.getByText(/text in every cell/)).not.toBeNull();
    pick('Writing direction', 'vertical_rl');
    expect(file()).toContain('writingMode: vertical_rl');
  });
});

describe('the not-set row', () => {
  it('reads "not set", not the panel’s "(default)", beside an explicit Off', () => {
    open(doc('{ type: text, text: hi, style: { writingMode: vertical_rl } }'));
    const options = Array.from((field('Horizontal in vertical') as HTMLSelectElement).options);
    expect(options[0].textContent).toBe('(Not set)');
    expect(options.map((o) => o.textContent)).toContain('Off');
  });
});

describe('the vertical-only pair', () => {
  it('stays while authored on horizontal text, so it can be cleared', () => {
    open(doc('{ type: text, text: hi, style: { textOrientation: upright } }'));
    expect(field('Character orientation')?.value).toBe('upright');
    expect(field('Horizontal in vertical')).toBeNull();
    pick('Character orientation', '');
    expect(file()).not.toContain('textOrientation');
    expect(field('Character orientation')).toBeNull();
  });

  it('appears under a container that makes its text vertical, with where it came from', () => {
    open(
      doc(
        '{ type: container, style: { writingMode: vertical_rl }, items: [{ type: text, text: hi }] }',
      ),
      { path: `${P}.items[0]` },
    );
    expect(field('Writing direction')?.value).toBe('');
    expect(screen.getByText('Inherited from the level above')).not.toBeNull();
    expect(screen.getByText('Vertical', { selector: 'span.text-text' })).not.toBeNull();
    expect(field('Horizontal in vertical')).not.toBeNull();
  });
});

describe('upright digits (the map form)', () => {
  it('writes the digits map, then a keyword over it, then clears', () => {
    open(doc('{ type: text, text: hi, style: { writingMode: vertical_rl } }'));
    pick('Horizontal in vertical', 'digits2');
    expect(file()).toContain('textCombineUpright: { digits: 2 }');
    expect(field('Horizontal in vertical')?.value).toBe('digits2');
    pick('Horizontal in vertical', 'all');
    expect(file()).toContain('textCombineUpright: all');
    expect(file()).not.toContain('digits:');
    expect(field('Horizontal in vertical')?.value).toBe('all');
    pick('Horizontal in vertical', '');
    expect(file()).not.toContain('textCombineUpright');
  });

  it('reads a digits map from a named style through the cascade', () => {
    open(
      doc(
        '{ type: text, text: hi, styleNames: [tcy], style: { writingMode: vertical_rl } }',
        'styles:\n  tcy: { textCombineUpright: { digits: 3 } }\n',
      ),
    );
    expect(field('Horizontal in vertical')?.value).toBe('');
    expect(screen.getByText('From style "tcy"')).not.toBeNull();
    expect(screen.getByText('Up to 3 digits', { selector: 'span.text-text' })).not.toBeNull();
  });

  it('keeps an unreadable value visible on horizontal text, labelled, and clears it', () => {
    open(doc('{ type: text, text: hi, style: { textCombineUpright: { digits: 2.5 } } }'));
    const select = field('Horizontal in vertical') as HTMLSelectElement;
    expect(select.value).toBe('invalid');
    expect(select.selectedOptions[0].textContent).toBe(
      'Invalid value (choose “Not set” to remove)',
    );
    pick('Horizontal in vertical', '');
    expect(file()).not.toContain('textCombineUpright');
    expect(field('Horizontal in vertical')).toBeNull();
  });

  it('names an unreadable value a named style supplies with the short label only', () => {
    open(
      doc(
        '{ type: text, text: hi, styleNames: [bad], style: { writingMode: vertical_rl } }',
        'styles:\n  bad: { textCombineUpright: [2] }\n',
      ),
    );
    expect(screen.getByText('Invalid value', { selector: 'span.text-text' })).not.toBeNull();
    expect(field('Horizontal in vertical')?.value).toBe('');
  });

  it('shows an out-of-range digits value as itself rather than as not set', () => {
    open(
      doc(
        '{ type: text, text: hi, style: { writingMode: vertical_rl, textCombineUpright: { digits: 9 } } }',
      ),
    );
    const select = field('Horizontal in vertical') as HTMLSelectElement;
    expect(select.value).toBe('digits9');
  });
});

describe('the capability gates', () => {
  it('withholds the whole section from an engine without any of the keys', () => {
    render(<Harness text={doc('{ type: text, text: hi }')} capabilities={[]} path={P} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.queryByRole('button', { name: SECTION })).toBeNull();
  });

  it('offers strict and loose only behind their key', () => {
    open(doc('{ type: text, text: hi }'), { capabilities: ['style.lineBreak'] });
    const options = Array.from((field('Line-break rules') as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(options).toEqual(['', 'normal', 'anywhere']);
    expect(shownFields()).toEqual(['Line-break rules']);
  });
});

describe('the circle on vertical text', () => {
  it('says the circle is not drawn while the text is vertical, and only then', () => {
    open(doc('{ type: text, text: hi, mark: {} }'));
    expect(screen.queryByText(/circle around this text/)).toBeNull();
    pick('Writing direction', 'vertical_rl');
    expect(screen.getByText(/circle around this text is not drawn/)).not.toBeNull();
  });
});

describe('the closed summary', () => {
  it('names what the item sets, and says not set otherwise', () => {
    open(doc('{ type: text, text: hi, style: { writingMode: vertical_rl, lineBreak: strict } }'));
    fireEvent.click(screen.getByRole('button', { name: SECTION }));
    expect(screen.getByText('Vertical · Strict')).not.toBeNull();
  });

  it('says not set when the item authors none of the keys', () => {
    open(doc('{ type: text, text: hi }'));
    const toggle = screen.getByRole('button', { name: SECTION });
    fireEvent.click(toggle);
    expect(toggle.closest('h3')?.textContent).toContain('Not set');
  });
});
