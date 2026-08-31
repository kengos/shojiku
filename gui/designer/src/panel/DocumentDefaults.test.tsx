import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import type { LocaleFacts } from '../engine/types';
import { I18nProvider } from '../i18n/context';
import { ENGINE_ONLY_LOCALES, LOCALES } from '../i18n/locales';
import { swatchLabel } from '../testkit/swatchLabel';
import { unitHintsFor } from '../testkit/unitHint';
import { DocumentDefaults } from './DocumentDefaults';

/** A real-editor harness: applying an op mutates the document and re-renders, so
 * tests assert the serialized doc, not a spy.
 *
 * `section` mirrors the product surface, which renders ONE half at a time and
 * supplies its own heading. `'both'` (the default here) mounts both halves side
 * by side — the arrangement a test wants when it is checking that the two are
 * independent, and the only reason this harness composes rather than passes a
 * prop through. */
function Harness({
  source,
  fontFamilies,
  capabilities,
  defaultFontFamily,
  localeFacts = null,
  section = 'both',
}: {
  readonly source: string;
  readonly fontFamilies?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly defaultFontFamily?: string;
  readonly localeFacts?: LocaleFacts | null;
  readonly section?: 'locale' | 'style' | 'both';
}) {
  const editor = useEditor(source);
  const halves = section === 'both' ? (['locale', 'style'] as const) : ([section] as const);
  return (
    <I18nProvider locale="en">
      {halves.map((half) => (
        <DocumentDefaults
          key={half}
          controller={editor}
          fontFamilies={fontFamilies}
          capabilities={capabilities}
          defaultFontFamily={defaultFontFamily}
          localeFacts={localeFacts}
          section={half}
        />
      ))}
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
    // The locale datalist is the ENGINE-resolvable set, not the chrome tags:
    // this key is the CLI/MCP render fallback, so every option must be one a
    // host can actually resolve. Five regional Englishes collapse onto en-US,
    // and th-TH — a shipped pack with no Thai chrome — is the case that
    // separates the two axes in the other direction.
    const options = Array.from(document.querySelectorAll('#sj-defaults-locale option'), (o) =>
      o.getAttribute('value'),
    );
    expect(options).toEqual([
      ...new Set(LOCALES.map((l) => l.engineLocale)),
      ...ENGINE_ONLY_LOCALES,
    ]);
    expect(options).toContain('th-TH');
    expect(LOCALES.map((l) => l.tag)).not.toContain('th-TH');
    // The trap this replaced: en-GB is a chrome language and NOT an engine
    // locale, so offering it authored a document every host refuses.
    expect(LOCALES.map((l) => l.tag)).toContain('en-GB');
    expect(options).not.toContain('en-GB');
    // …and no option is a duplicate, since five entries share en-US.
    expect(new Set(options).size).toBe(options.length);
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
    fireEvent.change(screen.getByLabelText('Text alignment'), { target: { value: 'center' } });
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
    // A newer Designer over a much older engine: both halves gate off, and the
    // surface contributes no control at all rather than an empty frame.
    const { container } = render(<Harness source={BASE} capabilities={[]} />);
    expect(screen.queryByLabelText('Locale')).toBeNull();
    expect(screen.queryByLabelText('Line height')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
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

  // The seven cases that used to live here asserted the panel's OWN
  // per-locale sample table — the Indian grouping, the Buddhist-ish date
  // shape, the amount's fraction digits, the regional-English resolution.
  // The panel composes none of that any more, so each claim moved to the
  // layer that now owns it rather than being dropped:
  //
  //   - the samples themselves      → `formats/tests/facts.rs` (per pack) and
  //                                   `integration/wasm.test.ts` (real engine)
  //   - an unset / unresolvable tag → `hooks/useLocaleFacts.test.tsx`
  //
  // The regional-English case is no longer a RESOLUTION at all: the picker
  // offers only engine-resolvable tags and nothing substitutes what it
  // offers, so `en-GB` is simply not on the list (pinned in this file's
  // first test) and a document carrying one goes unexplained.
  //
  // What is left HERE is the only part still the panel's: does it say what it
  // was handed, and does it stay quiet when it was handed nothing — the
  // describe block at the foot of this file.

  // (The standalone stacked form this surface used to offer with no `section`
  // is gone — no product surface ever rendered it. The heading string its one
  // test guarded is asserted on the real surface, in `DocumentSettingsPage`'s
  // own suite, by rendered text rather than by coverage.)

  describe('the field layout', () => {
    it('places every inherited style key exactly once', () => {
      // A new inherited key must be PLACED in the row layout — the section
      // renders from the layout, so an unplaced key would vanish silently.
      render(<Harness source={BASE} section="style" />);
      const labels = [
        'Font size',
        'Line height',
        'Font family',
        'Weight',
        'Style',
        'Text alignment',
      ];
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
      fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
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
        ['Text alignment', 'Left'],
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

// The unit affordance (`stepper.unitHint`) is OPT-IN per field, because the
// WIRE decides which keys take `25mm`. Pinned AT the site: an optional prop
// whose default is the disabled value can be dropped in a refactor with no
// type error, no lint and no red test.

describe('DocumentDefaults unit affordance', () => {
  it('invites another unit on the default font size', () => {
    render(<Harness source={BASE} fontFamilies={['gf-lato']} />);
    expect(unitHintsFor('Font size').length).toBeGreaterThan(0);
  });
});

// `SeededField` is the seventeenth refusing site, and the one a sweep of the
// WIDGETS misses: its own blur handler carries an unchanged-guard, not a
// refusal, so it looks inert until you follow its CONSUMER. Document settings
// renders every non-colour spec through it, and the number-kind spec (line
// height) builds through `numberOp`, which returns null for a non-finite entry.

describe('DocumentDefaults style field refusal snap-back', () => {
  const AUTHORED = `defaults:\n  style:\n    lineHeight: 1.5\n${BASE}`;
  const lineHeight = () => screen.getByLabelText('Line height') as HTMLInputElement;

  for (const typed of ['abc', '1.2.3']) {
    it(`snaps the line height back and authors nothing for ${JSON.stringify(typed)}`, () => {
      render(<Harness source={AUTHORED} section="style" />);
      const before = doc();
      fireEvent.blur(lineHeight(), { target: { value: typed } });
      expect(doc()).toBe(before);
      expect(lineHeight().value).toBe('1.5');
    });
  }

  it('still CLEARS an authored line height, which is a real edit', () => {
    // An empty value hands the key back to the engine default. Snapping back
    // here would make the field impossible to unset.
    render(<Harness source={AUTHORED} section="style" />);
    fireEvent.blur(lineHeight(), { target: { value: '' } });
    expect(doc()).not.toContain('lineHeight');
  });

  it('still commits an acceptable line height', () => {
    render(<Harness source={AUTHORED} section="style" />);
    fireEvent.blur(lineHeight(), { target: { value: '1.8' } });
    expect(doc()).toContain('lineHeight: 1.8');
  });

  it('mints no undo step for a refused line height', () => {
    render(<Harness source={AUTHORED} section="style" />);
    const before = doc();
    fireEvent.blur(lineHeight(), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(doc()).toBe(before);
  });

  it('leaves an UNSET field empty on a bare blur rather than seeding it', () => {
    // The unset state is an empty box over a placeholder; a reseed that
    // wrote the seed in would claim the document authored a value it did not.
    render(<Harness source={BASE} section="style" />);
    const before = doc();
    fireEvent.blur(lineHeight());
    expect(doc()).toBe(before);
    expect(lineHeight().value).toBe('');
  });
});

describe('the what-this-pick-does lines', () => {
  const FACTS: LocaleFacts = {
    id: 'ja-JP',
    date: '2026/11/03(火)',
    number: '12,345,678.9',
    currencyDefault: 'JPY',
    amount: '1,234,568',
  };

  it('repeats the ENGINE\u2019s samples verbatim', () => {
    render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} localeFacts={FACTS} />);
    // Asserted on the rendered TEXT, not on the prop: the panel's whole job
    // here is to say these values out loud, and nothing in it may format.
    expect(screen.getByText(/2026\/11\/03\(火\)/)).toBeTruthy();
    expect(screen.getByText(/12,345,678\.9/)).toBeTruthy();
    expect(screen.getByText(/1,234,568/)).toBeTruthy();
  });

  it('names the pack when it is not the tag on screen', () => {
    // The engine widens a bare language (`ja` → `ja-JP`) — its only aliasing
    // — and a document may carry any string. Saying which pack answered is
    // what stops the reader assuming their own tag was understood.
    render(
      <Harness
        source={`defaults:\n  locale: ja\n${BASE}`}
        localeFacts={{ ...FACTS, id: 'ja-JP' }}
      />,
    );
    expect(screen.getByText(/ja-JP pack/)).toBeTruthy();
  });

  it('says nothing about the pack when it IS the tag on screen', () => {
    render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} localeFacts={FACTS} />);
    expect(screen.queryByText(/pack/)).toBeNull();
  });

  it('claims nothing when the engine has not answered', () => {
    // The gate BOTH ways: this is what a transport without `localeFacts`
    // leaves behind, and an optional prop defaulting to `null` is a feature
    // that can be switched off by omission.
    render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} localeFacts={null} />);
    expect(screen.queryByText(/2026/)).toBeNull();
    expect(screen.queryByText(/12,345,678/)).toBeNull();
    // The plain hint stands in for the amount sentence.
    expect(screen.getByText(/Each bound field can choose/)).toBeTruthy();
  });

  it('drops only the currency-naming sentence for a pack with no default currency', () => {
    // A third-party pack may declare none. The engine reports the absence as
    // an empty code; the locale line NAMES that code, so it goes — while the
    // amount line, which needs only the amount, stays.
    render(
      <Harness
        source={`defaults:\n  locale: xx-YY\n${BASE}`}
        localeFacts={{ ...FACTS, currencyDefault: '', amount: '1,234,567.89' }}
      />,
    );
    expect(screen.queryByText(/2026\/11\/03/)).toBeNull();
    expect(screen.getByText(/1,234,567\.89/)).toBeTruthy();
  });
});
