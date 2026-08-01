import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { StyleFieldInput } from './StyleFieldInput';
import type { StyleFieldSpec } from './styleFieldSpecs';

const TEXT: StyleFieldSpec = { key: 'color', labelKey: 'x', kind: 'text', options: [] };
const FAMILY: StyleFieldSpec = { key: 'fontFamily', labelKey: 'x', kind: 'text', options: [] };
const SELECT: StyleFieldSpec = {
  key: 'fontWeight',
  labelKey: 'x',
  kind: 'select',
  options: ['normal', 'bold'],
};

function draw(spec: StyleFieldSpec, over: Partial<Parameters<typeof StyleFieldInput>[0]> = {}) {
  render(
    <I18nProvider locale="en">
      <StyleFieldInput
        spec={spec}
        label="Field"
        value=""
        noneLabel="(none)"
        fontFamilies={[]}
        familyListId="sj-fam"
        onCommit={vi.fn()}
        {...over}
      />
    </I18nProvider>,
  );
}

describe('StyleFieldInput', () => {
  it('renders a select with the none option (non-seed)', () => {
    draw(SELECT);
    const values = Array.from(
      (screen.getByLabelText('Field') as HTMLSelectElement).options,
      (o) => o.value,
    );
    expect(values).toEqual(['', 'normal', 'bold']);
  });

  it('renders a fontFamily combo (datalist) when host families are supplied (non-seed)', () => {
    draw(FAMILY, { fontFamilies: ['gf-lato', 'gf-kanit'] });
    expect(screen.getByLabelText('Field').getAttribute('list')).toBe('sj-fam');
  });

  it('renders a plain text input for fontFamily without host families (non-seed)', () => {
    draw(FAMILY);
    expect(screen.getByLabelText('Field').getAttribute('list')).toBeNull();
  });

  it('renders a plain text input for a text field (non-seed)', () => {
    draw(TEXT);
    expect(screen.getByLabelText('Field').getAttribute('list')).toBeNull();
  });

  it('keeps the unset option selected in seed mode, so nothing reads as authored', () => {
    draw(SELECT, { seedMode: true, seed: 'normal', noneLabel: 'Not set (Regular)' });
    const select = screen.getByLabelText('Field') as HTMLSelectElement;
    expect(Array.from(select.options, (o) => o.value)).toEqual(['', 'normal', 'bold']);
    expect(select.value).toBe('');
    // The unset option is where the engine fallback is NAMED — the old form
    // seeded it as the selected value, which read as a setting the user made.
    expect(select.options[0].textContent).toBe('Not set (Regular)');
  });

  it('shows the authored value over the unset option in seed mode (select)', () => {
    draw(SELECT, { seedMode: true, seed: 'normal', value: 'bold' });
    expect((screen.getByLabelText('Field') as HTMLSelectElement).value).toBe('bold');
  });

  it('localizes a select option through optionLabel while committing the spelling', () => {
    const onCommit = vi.fn<(value: string) => void>();
    draw(SELECT, { optionLabel: (option) => `<${option}>`, onCommit });
    const select = screen.getByLabelText('Field') as HTMLSelectElement;
    expect(Array.from(select.options, (o) => o.textContent)).toEqual([
      '(none)',
      '<normal>',
      '<bold>',
    ]);
    fireEvent.change(select, { target: { value: 'bold' } });
    expect(onCommit).toHaveBeenCalledWith('bold');
  });

  it('renders an EMPTY seeded field in seed mode, the fallback as its placeholder (text)', () => {
    draw(TEXT, { seedMode: true, seed: '#000000' });
    const input = screen.getByLabelText('Field') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.getAttribute('placeholder')).toBe('#000000');
  });

  it('renders a seeded fontFamily datalist in seed mode when families are supplied', () => {
    draw(FAMILY, {
      seedMode: true,
      seed: 'biz-udp-gothic',
      fontFamilies: ['gf-lato'],
    });
    expect(screen.getByLabelText('Field').getAttribute('list')).toBe('sj-fam');
  });
});
