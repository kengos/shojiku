import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { LOCALES } from '../i18n/locales';
import { DocumentDefaults } from './DocumentDefaults';
import { localeFacts } from './localeFacts';

/** A real-editor harness: applying an op mutates the document and re-renders, so
 * tests assert the serialized doc, not a spy. */
function Harness({
  source,
  fontFamilies,
  capabilities,
  defaultFontFamily,
  section,
}: {
  readonly source: string;
  readonly fontFamilies?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly defaultFontFamily?: string;
  readonly section?: 'locale' | 'style';
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <DocumentDefaults
        controller={editor}
        fontFamilies={fontFamilies}
        capabilities={capabilities}
        defaultFontFamily={defaultFontFamily}
        section={section}
      />
      <button type="button" onClick={editor.undo}>
        undo
      </button>
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

const BASE = 'sections:\n  body:\n    type: flow\n    items: []\n';

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

describe('DocumentDefaults', () => {
  it('renders locale + currency combos, the preview hint, and style fields', () => {
    render(<Harness source={`defaults:\n  locale: ja-JP\n  currency: JPY\n${BASE}`} />);
    expect((screen.getByLabelText('Locale') as HTMLInputElement).value).toBe('ja-JP');
    expect((screen.getByLabelText('Currency') as HTMLInputElement).value).toBe('JPY');
    // The locale datalist is the endonym registry's tags PLUS the engine
    // locales that have no chrome catalog of their own. th-TH is the case
    // that separates the two axes: it ships a locale pack (Buddhist era,
    // baht, Thai month names) while the Designer's UI has no Thai, so it
    // must be offered here and must NOT be in the chrome registry.
    const options = Array.from(document.querySelectorAll('#sj-defaults-locale option'), (o) =>
      o.getAttribute('value'),
    );
    expect(options.slice(0, LOCALES.length)).toEqual(LOCALES.map((l) => l.tag));
    expect(options).toContain('th-TH');
    expect(LOCALES.map((l) => l.tag)).not.toContain('th-TH');
    // Every EXTRA tag can say what it does — that is the whole point of
    // sourcing them from the facts table. (The chrome tags cannot be
    // checked this way: `localeFacts` is keyed by the ENGINE locale, and a
    // regional English like en-GB resolves to en-US before the lookup.)
    for (const tag of options.slice(LOCALES.length)) {
      expect(localeFacts(tag as string), tag as string).not.toBeNull();
    }
    // The hint says the preview does not follow the locale.
    expect(screen.getByText(/preview doesn't follow/i)).toBeTruthy();
    // The inherited-subset style editor is present, backgroundColor is not.
    expect(screen.getByLabelText('Line height')).toBeTruthy();
    expect(screen.queryByLabelText('Background')).toBeNull();
  });

  it('sets defaults.locale + currency on commit and clears on empty', () => {
    render(<Harness source={BASE} />);
    fireEvent.blur(screen.getByLabelText('Locale'), { target: { value: 'en-US' } });
    expect(doc()).toContain('locale: en-US');
    fireEvent.blur(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    expect(doc()).toContain('currency: USD');
    fireEvent.blur(screen.getByLabelText('Locale'), { target: { value: '' } });
    expect(doc()).not.toContain('locale:');
  });

  it('edits a default style field through the shared style input', () => {
    render(<Harness source={BASE} fontFamilies={['gf-lato']} />);
    // A bare number authors a number under defaults.style.
    fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '12' } });
    expect(doc()).toContain('fontSize: 12');
    // A select field (textAlign) authors its enum value verbatim.
    fireEvent.change(screen.getByLabelText('Align'), { target: { value: 'center' } });
    expect(doc()).toContain('textAlign: center');
    // fontFamily is a datalist combo when host families are supplied.
    expect(screen.getByLabelText('Font family').getAttribute('list')).toBe('sj-defaults-family');
  });

  it('gates locale/currency and default style on their capability keys', () => {
    // Only the document capability: locale/currency show, the style editor hides.
    const { unmount } = render(
      <Harness source={BASE} capabilities={['template.defaults.document']} />,
    );
    expect(screen.getByLabelText('Locale')).toBeTruthy();
    expect(screen.queryByLabelText('Line height')).toBeNull();
    unmount();
    // Only the defaults capability: the style editor shows, locale/currency hide.
    render(<Harness source={BASE} capabilities={['template.defaults']} />);
    expect(screen.queryByLabelText('Locale')).toBeNull();
    expect(screen.getByLabelText('Line height')).toBeTruthy();
  });

  it('renders nothing when the engine has neither defaults capability', () => {
    render(<Harness source={BASE} capabilities={[]} />);
    expect(screen.queryByText('Document defaults')).toBeNull();
  });

  it('authors a hostile locale value as inert escaped text (no code execution)', () => {
    render(<Harness source={BASE} />);
    const hostile = '<script>alert(1)</script>';
    fireEvent.blur(screen.getByLabelText('Locale'), { target: { value: hostile } });
    // The value round-trips as a quoted YAML string; React renders it as text —
    // the input's value is the literal string, never parsed as markup.
    expect((screen.getByLabelText('Locale') as HTMLInputElement).value).toBe(hostile);
    expect(document.querySelector('script')).toBeNull();
  });

  describe('what the locale and currency picks actually DO', () => {
    it('reports the engine data behind the picked locale', () => {
      render(<Harness source={`defaults:\n  locale: ja-JP\n  currency: JPY\n${BASE}`} />);
      expect(
        screen.getByText(/Dates print as 2026\/01\/05\(月\), numbers as 1,234,567\.5/),
      ).toBeTruthy();
      expect(screen.getByText(/amounts default to JPY/)).toBeTruthy();
    });

    it('shows a locale whose GROUPING differs, not just its separators', () => {
      // hi-IN groups the Indian way (lakh/crore). The sample must carry
      // enough digits to reveal that — at 1,234.5 it read identically to
      // every other locale and the panel under-described the pick.
      render(<Harness source={`defaults:\n  locale: hi-IN\n${BASE}`} />);
      expect(screen.getByText(/numbers as 12,34,567\.5/)).toBeTruthy();
    });

    it('resolves a regional English through the locale the engine actually has', () => {
      // en-GB has no pack of its own; the engine formats it as en-US, and the
      // section must report THAT rather than nothing or a guess.
      render(<Harness source={`defaults:\n  locale: en-GB\n${BASE}`} />);
      expect(screen.getByText(/Dates print as Jan 5, 2026/)).toBeTruthy();
    });

    it('claims nothing about an unset locale', () => {
      render(<Harness source={BASE} />);
      expect(screen.queryByText(/Dates print as/)).toBeNull();
      // …and the currency line degrades to the part that is still true.
      expect(
        screen.getByText('Each bound field can choose the symbol or the currency name.'),
      ).toBeTruthy();
    });

    it('claims nothing about a hostile locale tag', () => {
      render(<Harness source={`defaults:\n  locale: constructor\n${BASE}`} />);
      expect(screen.queryByText(/Dates print as/)).toBeNull();
    });

    it('shows the amount shape for the picked currency', () => {
      render(<Harness source={`defaults:\n  locale: ja-JP\n  currency: USD\n${BASE}`} />);
      expect(screen.getByText(/Amounts print like 1,234\.00/)).toBeTruthy();
    });

    it('falls back to the locale default currency when none is picked', () => {
      render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} />);
      // JPY carries no decimals — the shape differs from the two-digit default.
      expect(screen.getByText(/Amounts print like 1,234\./)).toBeTruthy();
    });
  });

  describe('the standalone stacked form (no section prop)', () => {
    it('titles the style half with a REAL catalog string', () => {
      // The section heading moved to a new key when 「既定の文字スタイル」 was
      // retired; this branch kept calling the deleted one, and no assertion on
      // the rendered heading existed to notice (the line was still covered).
      render(<Harness source={BASE} />);
      const heading = screen.getByRole('heading', { level: 4 });
      expect(heading.textContent).toBe('Normal text');
    });
  });

  describe('the field layout', () => {
    it('places every inherited style key exactly once', () => {
      // A new inherited key must be PLACED in the row layout — the section
      // renders from the layout, so an unplaced key would vanish silently.
      render(<Harness source={BASE} section="style" />);
      const labels = ['Font size', 'Line height', 'Font family', 'Weight', 'Style', 'Align'];
      for (const label of labels) {
        expect(screen.getAllByLabelText(label).length).toBe(1);
      }
      // The colour field is a swatch trigger, not a labelled input.
      expect(screen.getAllByRole('button', { name: 'Color' }).length).toBe(1);
    });
  });

  describe('the default text colour', () => {
    it('is picked from a swatch, never typed as hex', () => {
      render(<Harness source={BASE} section="style" />);
      fireEvent.click(screen.getByRole('button', { name: 'Color' }));
      fireEvent.click(screen.getByRole('menuitem', { name: '#b91c1c' }));
      expect(doc()).toContain('color: "#b91c1c"');
    });

    it('seeds the picker with the engine fallback while the key is unset', () => {
      render(<Harness source={BASE} section="style" />);
      fireEvent.click(screen.getByRole('button', { name: 'Color' }));
      // The chip/native input carry what the document actually renders at, so
      // the unset state is not a blank swatch.
      expect((screen.getByLabelText('Custom') as HTMLInputElement).value).toBe('#000000');
    });

    it('seeds the picker with the authored colour once the key is set', () => {
      render(
        <Harness source={`defaults:\n  style:\n    color: "#123456"\n${BASE}`} section="style" />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Color' }));
      expect((screen.getByLabelText('Custom') as HTMLInputElement).value).toBe('#123456');
    });
  });

  describe('the recommended body size', () => {
    it('suggests a readable body size without authoring anything', () => {
      render(<Harness source={BASE} section="style" />);
      expect(screen.getByText(/around 10\.5pt/)).toBeTruthy();
      expect(doc()).not.toContain('fontSize');
    });

    it('authors the recommendation on one click', () => {
      render(<Harness source={BASE} section="style" />);
      fireEvent.click(screen.getByRole('button', { name: 'Use 10.5pt' }));
      expect(doc()).toContain('fontSize: 10.5');
    });

    it('explains that untouched fields are not written', () => {
      render(<Harness source={BASE} section="style" />);
      expect(screen.getByText(/only what you change is written to the file/)).toBeTruthy();
    });
  });

  describe('engine-default seeding (the defaults surface)', () => {
    it('leaves every unset field reading UNSET, the engine fallback only a hint', () => {
      render(<Harness source={BASE} />);
      // Text fields: empty box, fallback in the placeholder — an unauthored key
      // must never look like a value the document set.
      for (const [label, fallback] of [
        ['Font size', '10'],
        ['Line height', '1.4'],
      ]) {
        const input = screen.getByLabelText(label) as HTMLInputElement;
        expect(input.value).toBe('');
        expect(input.getAttribute('placeholder')).toBe(fallback);
      }
      // Selects: the unset option is selected, and it NAMES the fallback.
      for (const [label, fallback] of [
        ['Weight', 'Regular'],
        ['Style', 'Upright'],
        ['Align', 'Left'],
      ]) {
        const select = screen.getByLabelText(label) as HTMLSelectElement;
        expect(select.value).toBe('');
        expect(select.options[0].textContent).toBe(`Not set (${fallback})`);
      }
      // The wire stays empty (no keys written).
      expect(doc()).not.toContain('defaults:');
    });

    it('offers the enum options in the reader’s language, committing the spelling', () => {
      render(<Harness source={BASE} />);
      const weight = screen.getByLabelText('Weight') as HTMLSelectElement;
      expect(Array.from(weight.options, (o) => o.textContent)).toEqual([
        'Not set (Regular)',
        'Regular',
        'Bold',
      ]);
      fireEvent.change(weight, { target: { value: 'bold' } });
      expect(doc()).toContain('fontWeight: bold');
    });

    it('can hand an authored enum key back through its unset option', () => {
      render(<Harness source={`defaults:\n  style:\n    fontWeight: bold\n${BASE}`} />);
      fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '' } });
      expect(doc()).not.toContain('fontWeight');
    });

    it('shows the authored value instead of the seed when a key is set', () => {
      render(<Harness source={`defaults:\n  style:\n    fontSize: 18\n${BASE}`} />);
      expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('18');
    });

    it('writes nothing when an unset field is blurred still empty', () => {
      render(<Harness source={BASE} />);
      fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '' } });
      expect(doc()).not.toContain('fontSize');
    });

    it('authors the fallback when it is typed in EXPLICITLY (a real choice)', () => {
      render(<Harness source={BASE} />);
      fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '10' } });
      expect(doc()).toContain('fontSize: 10');
    });

    it('writes nothing when an authored field is blurred unchanged', () => {
      render(<Harness source={`defaults:\n  style:\n    fontSize: 18\n${BASE}`} />);
      const before = doc();
      fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '18' } });
      expect(doc()).toBe(before);
    });

    it('writes exactly the touched key on an edit', () => {
      render(<Harness source={BASE} />);
      fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '12' } });
      expect(doc()).toContain('fontSize: 12');
      // No other style key was authored.
      expect(doc()).not.toContain('lineHeight');
      expect(doc()).not.toContain('color');
    });

    it('removes the key and returns to the unset look when an authored field is cleared', () => {
      render(<Harness source={`defaults:\n  style:\n    fontSize: 18\n${BASE}`} />);
      fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '' } });
      expect(doc()).not.toContain('fontSize');
      const input = screen.getByLabelText('Font size') as HTMLInputElement;
      expect(input.value).toBe('');
      expect(input.getAttribute('placeholder')).toBe('10');
    });

    it('writes the key on an explicit select pick', () => {
      render(<Harness source={BASE} />);
      fireEvent.change(screen.getByLabelText('Weight'), { target: { value: 'bold' } });
      expect(doc()).toContain('fontWeight: bold');
    });

    it('reverts to the unset look on undo', () => {
      render(<Harness source={BASE} />);
      fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '12' } });
      expect(doc()).toContain('fontSize: 12');
      fireEvent.click(screen.getByRole('button', { name: 'undo' }));
      expect(doc()).not.toContain('fontSize');
      expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('');
    });

    it('hints the fontFamily field with the host default face', () => {
      render(<Harness source={BASE} defaultFontFamily="biz-udp-gothic" />);
      const family = screen.getByLabelText('Font family') as HTMLInputElement;
      expect(family.value).toBe('');
      expect(family.getAttribute('placeholder')).toBe('biz-udp-gothic');
    });

    it('shows a placeholder for fontFamily when the host default is absent', () => {
      render(<Harness source={BASE} />);
      const family = screen.getByLabelText('Font family') as HTMLInputElement;
      expect(family.value).toBe('');
      expect(family.getAttribute('placeholder')).toBe('(locale default)');
    });

    it('renders a hostile fontFamily hint as inert text and writes nothing on a no-op blur', () => {
      const hostile = '<script>alert(1)</script>'.repeat(4);
      render(<Harness source={BASE} defaultFontFamily={hostile} />);
      const family = screen.getByLabelText('Font family') as HTMLInputElement;
      // The hostile host value reaches the DOM as a placeholder ATTRIBUTE, never
      // as markup — and an untouched field authors nothing.
      expect(family.getAttribute('placeholder')).toBe(hostile);
      expect(document.querySelector('script')).toBeNull();
      fireEvent.blur(family, { target: { value: '' } });
      expect(doc()).not.toContain('fontFamily');
    });
  });

  describe('section mode', () => {
    it('renders only the locale+currency half without the internal heading', () => {
      render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} section="locale" />);
      expect(screen.getByLabelText('Locale')).toBeTruthy();
      expect(screen.getByLabelText('Currency')).toBeTruthy();
      // No inherited-style fields, no internal `Default text style` heading.
      expect(screen.queryByLabelText('Line height')).toBeNull();
      expect(screen.queryByText('Default text style')).toBeNull();
    });

    it('renders only the inherited-style half without the internal heading', () => {
      render(<Harness source={BASE} section="style" />);
      expect(screen.getByLabelText('Line height')).toBeTruthy();
      expect(screen.queryByLabelText('Locale')).toBeNull();
      expect(screen.queryByText('Default text style')).toBeNull();
    });

    it('renders nothing for the locale half when the document capability is absent', () => {
      const { container } = render(
        <Harness source={BASE} section="locale" capabilities={['template.defaults']} />,
      );
      expect(screen.queryByLabelText('Locale')).toBeNull();
      // Only the doc-mirror `<pre>` remains — the section itself is null.
      expect(container.querySelector('input')).toBeNull();
    });

    it('renders nothing for the style half when the defaults capability is absent', () => {
      render(
        <Harness source={BASE} section="style" capabilities={['template.defaults.document']} />,
      );
      expect(screen.queryByLabelText('Line height')).toBeNull();
    });
  });
});
