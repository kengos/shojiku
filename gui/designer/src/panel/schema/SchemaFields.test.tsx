// The catalog-driven section over a LIVE host, one case per control kind on
// the real catalog's named-style fields: a commit writes exactly its key (one
// changed line), empty removes it, an unchanged blur writes nothing, and undo
// returns the text byte for byte. Values the controls cannot show stay on the
// read-only row and survive edits around them.

import { surfaceFields } from '@shojiku/designer-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveHost } from '../../testkit/schemaHost';
import { swatchLabel } from '../../testkit/swatchLabel';
import { COMPOSITES } from './composites';
import type { FieldEdit } from './fieldEdit';

const STYLE = surfaceFields({ kind: 'style' }, COMPOSITES);

function fields(...keys: string[]) {
  return STYLE.filter((field) => keys.includes(field.key));
}

/** A named style `s` holding `body` (two-space indented YAML lines). */
function source(...body: string[]): string {
  return [
    'styles:',
    '  keep: { color: "#123456" } # untouched',
    '  s:',
    ...body.map((l) => `    ${l}`),
  ]
    .concat(['    fontSize: 9', 'sections:', '  body:', '    type: flow', '    items: []', ''])
    .join('\n');
}

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

/** The lines of the document that differ from `before`, either side. */
function changed(before: string): string[] {
  const now = doc().split('\n');
  const was = before.split('\n');
  return [...now.filter((l) => !was.includes(l)), ...was.filter((l) => !now.includes(l))];
}

function blur(label: string, text: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.blur(input, { target: { value: text } });
}

describe('an enum key', () => {
  it('writes the picked spelling, removes the key on the unset row, and undoes byte for byte', () => {
    const src = source('lineBreak: normal');
    render(<LiveHost source={src} fields={fields('lineBreak')} />);
    const select = screen.getByLabelText('Line-break rules') as HTMLSelectElement;
    expect(select.value).toBe('normal');
    expect(screen.getByRole('option', { name: '(default)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'strict' } });
    expect(changed(src)).toEqual(['    lineBreak: strict', '    lineBreak: normal']);
    fireEvent.change(select, { target: { value: '' } });
    expect(doc()).not.toContain('lineBreak');
    fireEvent.click(screen.getByText('undo'));
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(src);
  });

  it('shows an out-of-set value as its own spelling and keeps it through another edit', () => {
    const src = source('lineBreak: auto');
    render(<LiveHost source={src} fields={fields('lineBreak', 'verticalAlign')} />);
    expect((screen.getByLabelText('Line-break rules') as HTMLSelectElement).value).toBe('auto');
    expect(screen.getByRole('option', { name: 'auto' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vertical alignment'), { target: { value: 'middle' } });
    expect(changed(src)).toEqual(['    verticalAlign: middle']);
  });

  it('names the initial value in the unset row where the surface shows initials', () => {
    render(
      <LiveHost source={source()} fields={fields('lineBreak')} context={{ unset: 'initial' }} />,
    );
    expect(screen.getByRole('option', { name: 'Not set (Standard)' })).toBeTruthy();
  });

  it('shows a value of the wrong shape on the read-only row and keeps it through another edit', () => {
    const src = source('lineBreak: 3');
    const edits: FieldEdit[] = [];
    render(<LiveHost source={src} fields={fields('lineBreak', 'verticalAlign')} edits={edits} />);
    expect(screen.queryByLabelText('Line-break rules')).toBeNull();
    expect(
      screen.getByText("This setting has a value that can't be shown or changed here."),
    ).toBeTruthy();
    expect(screen.getByText('You can edit it in the template file (YAML).')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vertical alignment'), { target: { value: 'bottom' } });
    expect(edits).toEqual([{ keys: ['verticalAlign'], value: 'bottom' }]);
    expect(changed(src)).toEqual(['    verticalAlign: bottom']);
  });

  it('shows an authored empty string on the read-only row rather than as unset', () => {
    render(
      <LiveHost
        source={source("lineBreak: ''", "borderColor: ''", "textCombineUpright: ''")}
        fields={fields('lineBreak', 'borderColor', 'textCombineUpright')}
      />,
    );
    expect(screen.queryByLabelText('Line-break rules')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Border color' })).toBeNull();
    expect(screen.queryByLabelText('Horizontal in vertical')).toBeNull();
    // Not a per-side map, so not the border sentence.
    expect(
      screen.getAllByText("This setting has a value that can't be shown or changed here."),
    ).toHaveLength(3);
  });

  it('shows a value with no display, the unset display, or one that would not author it back on the read-only row', () => {
    const cases: readonly [string, string][] = [
      ['textDecoration', 'none'],
      ['textDecoration', 'overline'],
      ['textDecoration', '5'],
      ['opacity', '2'],
      ['opacity', "'40%'"],
      ['opacity', 'true'],
      ['letterSpacing', '5000'],
      ['borderColor', "'#ABC'"],
      ['borderWidth', '[1, 2]'],
    ];
    for (const [key, value] of cases) {
      const { unmount } = render(
        <LiveHost source={source(`${key}: ${value}`)} fields={fields(key)} />,
      );
      // An array is not a per-side map, so none of these gets the border sentence.
      expect(
        screen.getByText("This setting has a value that can't be shown or changed here."),
      ).toBeTruthy();
      unmount();
    }
  });
});

describe('a length key', () => {
  it('writes a bare number, keeps a unit, removes on empty, and writes nothing on an unchanged blur', () => {
    const src = source('letterSpacing: 2');
    const edits: FieldEdit[] = [];
    render(<LiveHost source={src} fields={fields('letterSpacing')} edits={edits} />);
    blur('Letter spacing', '2');
    expect(edits).toEqual([]);
    blur('Letter spacing', '3');
    expect(changed(src)).toEqual(['    letterSpacing: 3', '    letterSpacing: 2']);
    blur('Letter spacing', '0.5mm');
    expect(doc()).toContain('letterSpacing: 0.5mm');
    blur('Letter spacing', '');
    expect(doc()).not.toContain('letterSpacing');
    fireEvent.click(screen.getByText('undo'));
    fireEvent.click(screen.getByText('undo'));
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(src);
  });

  it('refuses an entry past the catalog bound and steps by one point', () => {
    const src = source('borderRadius: 4');
    render(<LiveHost source={src} fields={fields('borderRadius', 'letterSpacing')} />);
    blur('Letter spacing', '5000');
    expect(doc()).toBe(src);
    // The refused entry does not stay on screen over the document.
    expect((screen.getByLabelText('Letter spacing') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Corner radius' }));
    expect(changed(src)).toEqual(['    borderRadius: 5', '    borderRadius: 4']);
  });

  it('writes an em length as typed, refuses a percentage and other text, and stops at the bound', () => {
    const src = source('letterSpacing: 1000');
    render(<LiveHost source={src} fields={fields('letterSpacing')} />);
    blur('Letter spacing', 'wide');
    // The engine refuses `%` on this key at parse, which would fail the template.
    blur('Letter spacing', '50%');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Letter spacing' }));
    expect(doc()).toBe(src);
    blur('Letter spacing', '2em');
    expect(changed(src)).toEqual(['    letterSpacing: 2em', '    letterSpacing: 1000']);
  });
});

describe('a number and a percent key', () => {
  it('writes a number within its bounds', () => {
    const src = source();
    render(<LiveHost source={src} fields={fields('lineHeight')} />);
    blur('Line height', '1.6');
    expect(changed(src)).toEqual(['    lineHeight: 1.6']);
    blur('Line height', '-1');
    expect(changed(src)).toEqual(['    lineHeight: 1.6']);
  });

  it('shows a fraction as a percentage and writes the typed percentage as a fraction', () => {
    const src = source('opacity: 0.4');
    render(<LiveHost source={src} fields={fields('opacity')} />);
    expect((screen.getByLabelText('Opacity') as HTMLInputElement).value).toBe('40');
    blur('Opacity', '65');
    expect(changed(src)).toEqual(['    opacity: 0.65', '    opacity: 0.4']);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Opacity' }));
    expect(doc()).toContain('opacity: 0.55');
    blur('Opacity', 'abc');
    expect(doc()).toContain('opacity: 0.55');
  });

  it('shows a fraction it cannot write as a plain percentage on the read-only row', () => {
    render(<LiveHost source={source('opacity: 1e-7')} fields={fields('opacity')} />);
    expect(screen.queryByLabelText('Opacity')).toBeNull();
    expect(
      screen.getByText("This setting has a value that can't be shown or changed here."),
    ).toBeTruthy();
  });

  it('steps an unset percentage down from fully opaque and not past 100', () => {
    const src = source();
    render(<LiveHost source={src} fields={fields('opacity')} context={{ unset: 'initial' }} />);
    expect((screen.getByLabelText('Opacity') as HTMLInputElement).placeholder).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Opacity' }));
    expect(doc()).toBe(src);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Opacity' }));
    expect(changed(src)).toEqual(['    opacity: 0.9']);
  });
});

describe('a key that also takes a per-side map', () => {
  it('edits the one-value form with the scalar arm control', () => {
    const src = source('borderWidth: 1');
    render(<LiveHost source={src} fields={fields('borderWidth', 'borderStyle')} />);
    blur('Border width', '2');
    expect(changed(src)).toEqual(['    borderWidth: 2', '    borderWidth: 1']);
    fireEvent.change(screen.getByLabelText('Border type'), { target: { value: 'dashed' } });
    expect(screen.getByRole('option', { name: 'Dashed' })).toBeTruthy();
    expect(doc()).toContain('borderStyle: dashed');
  });

  it('shows a per-side map read-only and keeps it through an edit of another key', () => {
    const src = source('borderWidth: { top: 1, bottom: 2 }');
    render(<LiveHost source={src} fields={fields('borderWidth', 'borderRadius')} />);
    expect(screen.queryByLabelText('Border width')).toBeNull();
    expect(
      screen.getByText("Each side has its own border. This can't be changed here."),
    ).toBeTruthy();
    blur('Corner radius', '3');
    expect(changed(src)).toEqual(['    borderRadius: 3']);
  });

  it('shows a percentage radius read-only and keeps it through an edit of another key', () => {
    const src = source('borderRadius: 50%');
    render(<LiveHost source={src} fields={fields('borderRadius', 'borderWidth')} />);
    expect(screen.queryByLabelText('Corner radius')).toBeNull();
    expect(
      screen.getByText("This setting has a value that can't be shown or changed here."),
    ).toBeTruthy();
    blur('Border width', '2');
    expect(changed(src)).toEqual(['    borderWidth: 2']);
  });

  it('picks a border colour from a swatch, names it, and clears it', () => {
    const src = source();
    render(<LiveHost source={src} fields={fields('borderColor')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Border color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(changed(src)).toEqual(['    borderColor: "#b91c1c"']);
    expect(screen.getByText(swatchLabel('#b91c1c'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Border color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(doc()).toBe(src);
  });
});

describe('the composites', () => {
  it('ticks the two decoration lines into one value, and clearing both removes the key', () => {
    const src = source();
    render(<LiveHost source={src} fields={fields('textDecoration')} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Underline' }));
    expect(changed(src)).toEqual(['    textDecoration: underline']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Strikethrough' }));
    expect(doc()).toContain('textDecoration: underline line_through');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Underline' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Strikethrough' }));
    expect(doc()).toBe(src);
  });

  it('reads the reversed two-line spelling as both lines', () => {
    render(
      <LiveHost
        source={source('textDecoration: line_through underline')}
        fields={fields('textDecoration')}
      />,
    );
    expect((screen.getByRole('checkbox', { name: 'Underline' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (screen.getByRole('checkbox', { name: 'Strikethrough' }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('keeps one line at a time against an engine without the combined value', () => {
    const src = source('textDecoration: underline line_through');
    render(
      <LiveHost
        source={src}
        fields={fields('textDecoration')}
        context={{ unset: 'blank', capabilities: ['style.textDecoration'] }}
      />,
    );
    // Unticking keeps the other line.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Underline' }));
    expect(doc()).toContain('textDecoration: line_through');
    // Ticking clears the other line.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Underline' }));
    expect(doc()).toContain('textDecoration: underline\n');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Strikethrough' }));
    expect(doc()).toContain('textDecoration: line_through\n');
  });

  it('writes tate-chu-yoko digits as the map and removes it on the unset row', () => {
    const src = source();
    render(<LiveHost source={src} fields={fields('textCombineUpright')} />);
    const select = screen.getByLabelText('Horizontal in vertical');
    fireEvent.change(select, { target: { value: 'digits2' } });
    expect(doc()).toContain('textCombineUpright:\n      digits: 2');
    fireEvent.change(select, { target: { value: 'all' } });
    expect(changed(src)).toEqual(['    textCombineUpright: all']);
    fireEvent.change(select, { target: { value: '' } });
    expect(doc()).toBe(src);
  });

  it('gives an unparseable tate-chu-yoko value its own row', () => {
    render(
      <LiveHost
        source={source('textCombineUpright: { digits: x }')}
        fields={fields('textCombineUpright')}
      />,
    );
    expect((screen.getByLabelText('Horizontal in vertical') as HTMLSelectElement).value).toBe(
      'invalid',
    );
  });
});

describe('text', () => {
  it('writes free text, removes on empty, and leaves a number it shows alone', () => {
    const src = source('fontFamily: 12');
    const edits: FieldEdit[] = [];
    render(<LiveHost source={src} fields={fields('fontFamily')} edits={edits} />);
    blur('Font family', '12');
    expect(edits).toEqual([]);
    blur('Font family', 'Noto Serif JP');
    expect(changed(src)).toEqual(['    fontFamily: Noto Serif JP', '    fontFamily: 12']);
    blur('Font family', ' ');
    expect(doc()).not.toContain('fontFamily');
  });
});

describe('layout', () => {
  it('heads each group, pairs short controls, and rules the last group', () => {
    const { container } = render(
      <LiveHost
        source={source()}
        fields={fields(
          'opacity',
          'lineBreak',
          'textSpacingTrim',
          'letterSpacing',
          'textDecoration',
        )}
      />,
    );
    expect(screen.getByText('Spacing & lines')).toBeTruthy();
    expect(screen.getByText('Vertical writing & line breaking')).toBeTruthy();
    expect(screen.queryByText('Border')).toBeNull();
    expect(container.querySelectorAll('.grid-cols-2')).toHaveLength(1);
    expect(container.querySelectorAll('.border-t')).toHaveLength(1);
  });
});
