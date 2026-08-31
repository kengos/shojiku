import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEditor } from '../editor/useEditor';
import type { LocaleFacts, RawPage } from '../engine/types';
import { buildFormatUsage } from '../formats/usage';
import { I18nProvider } from '../i18n/context';
import { buildStyleUsage } from '../styles/usage';
import { FORMAT_CATALOG, fakeProbe } from '../testkit/formatCatalog';
import { DocumentSettingsPage } from './DocumentSettingsPage';
import type { DocSection } from './docSections';

const BASE = 'sections:\n  body:\n    type: flow\n    items: []\n';

const page = (): RawPage => ({ width: 4, height: 6, rgba: new Uint8Array(4 * 6 * 4) });

function Harness({
  source = BASE,
  pages = [],
  defaultFontFamily,
  capabilities,
  withCatalog = true,
  noProbe = false,
  focus,
  localeFacts = null,
  onClose = vi.fn(),
}: {
  readonly source?: string;
  readonly pages?: readonly RawPage[];
  readonly defaultFontFamily?: string;
  readonly capabilities?: readonly string[];
  /** Omit the catalog to exercise the no-engine-answer degradation. */
  readonly withCatalog?: boolean;
  /** Omit the probe entirely — a host that supplied none. */
  readonly noProbe?: boolean;
  readonly focus?: { readonly section: DocSection; readonly nonce: number };
  readonly localeFacts?: LocaleFacts | null;
  readonly onClose?: () => void;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <DocumentSettingsPage
        controller={editor}
        styleUsage={buildStyleUsage(editor.text)}
        formatUsage={buildFormatUsage(editor.text)}
        formatCatalog={withCatalog ? FORMAT_CATALOG : null}
        localeFacts={localeFacts}
        probeFormat={noProbe ? undefined : fakeProbe()}
        maxBytes={2_000_000}
        defaultFontFamily={defaultFontFamily}
        capabilities={capabilities}
        pages={pages}
        focus={focus}
        onClose={onClose}
      />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

/** Select a rail entry — one section is on screen at a time, so a test for a
 * control outside the opening section opens its section first. */
function openSection(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

describe('DocumentSettingsPage', () => {
  it('lists every section in the rail and opens page setup first', () => {
    render(<Harness />);
    for (const name of [
      'Page setup',
      'Normal text',
      'Styles',
      'Locale & currency',
      'Display formats',
      'Document properties',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    // Only the opening section's body is mounted — the rail, not a scroller,
    // is what gets you to the others.
    expect(screen.getByRole('heading', { name: 'Page setup' })).toBeTruthy();
    expect(screen.getByLabelText('Size')).toBeTruthy();
    expect(screen.queryByLabelText('Line height')).toBeNull();
    expect(screen.queryByLabelText('Locale')).toBeNull();
  });

  it('swaps the body to the section the rail selects', () => {
    render(<Harness />);
    openSection('Normal text');
    expect(screen.getByRole('heading', { name: 'Normal text' })).toBeTruthy();
    expect(screen.getByLabelText('Line height')).toBeTruthy();
    openSection('Locale & currency');
    expect(screen.getByLabelText('Locale')).toBeTruthy();
    expect(screen.queryByLabelText('Line height')).toBeNull();
  });

  it('summarizes each section in its rail entry', () => {
    render(
      <Harness
        source={`defaults:\n  locale: ja-JP\n  currency: JPY\n  style:\n    fontSize: 12\n    fontFamily: biz-ud-gothic\nstyles:\n  heading: { fontWeight: bold }\n${BASE}`}
      />,
    );
    expect(screen.getByRole('button', { name: /^Normal text/ }).textContent).toContain(
      '12pt biz-ud-gothic',
    );
    expect(screen.getByRole('button', { name: /^Styles/ }).textContent).toContain('1 styles');
    expect(screen.getByRole('button', { name: /^Locale & currency/ }).textContent).toContain(
      'ja-JP · JPY',
    );
  });

  it('summarizes the document properties by title, or says they are unset', () => {
    render(<Harness source={`document:\n  title: Monthly invoice\n${BASE}`} />);
    expect(screen.getByRole('button', { name: /^Document properties/ }).textContent).toContain(
      'Monthly invoice',
    );
  });

  it('says the document properties are unset when nothing is authored', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /^Document properties/ }).textContent).toContain(
      'Not set',
    );
  });

  it('gates the document-properties section on the engine capability', () => {
    // Present: the rail row and the section body both exist.
    const withKey = render(<Harness capabilities={['template.document.metadata']} />);
    openSection('Document properties');
    expect(screen.getByLabelText('Title')).toBeTruthy();
    withKey.unmount();
    // Absent: no row at all — a row that opens onto nothing is worse than none.
    render(<Harness capabilities={[]} />);
    expect(screen.queryByRole('button', { name: /^Document properties/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Page setup/ })).toBeTruthy();
  });

  it('gates the display-formats section on EITHER of its two capabilities', () => {
    // Both halves gated off: no row at all.
    const none = render(<Harness capabilities={[]} />);
    expect(screen.queryByRole('button', { name: /^Display formats/ })).toBeNull();
    none.unmount();

    // Only the per-type defaults: the row exists and opens onto that half
    // alone — the registry's own heading is absent.
    const defaultsOnly = render(<Harness capabilities={['template.defaults']} />);
    openSection('Display formats');
    expect(screen.getByRole('button', { name: 'Choose the Date format' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New format' })).toBeNull();
    defaultsOnly.unmount();

    // Only the registry: the mirror image.
    const registryOnly = render(<Harness capabilities={['template.formats']} />);
    openSection('Display formats');
    expect(screen.getByRole('button', { name: 'New format' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose the Date format' })).toBeNull();
    registryOnly.unmount();

    // Both: both halves.
    render(<Harness capabilities={['template.defaults', 'template.formats']} />);
    openSection('Display formats');
    expect(screen.getByRole('button', { name: 'Choose the Date format' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New format' })).toBeTruthy();
  });

  it('summarizes the display formats in the rail, and degrades without a catalog', () => {
    const unset = render(<Harness />);
    expect(screen.getByRole('button', { name: /^Display formats/ }).textContent).toContain(
      'All locale defaults',
    );
    unset.unmount();

    render(
      <Harness source={`defaults:\n  formats:\n    date: wareki\n${BASE}`} withCatalog={false} />,
    );
    const rail = screen.getByRole('button', { name: /^Display formats/ });
    expect(rail.textContent).toContain('Japanese era');
    // No engine answer: the row still shows what the document holds.
    openSection('Display formats');
    expect(screen.getByText('Japanese era')).toBeTruthy();
  });

  it('offers the pattern surface, and SAYS it cannot preview, with no probe', async () => {
    // The field still renders — the surface degrades rather than branching on
    // availability at each call — but it no longer shows the prompt. This test
    // used to assert that it did, with a comment calling it the degraded
    // behaviour; the prompt reads "Press a token above, or type a pattern",
    // and with no probe there are no tokens above and typing changes nothing.
    // That is the state the standalone app was permanently in, so the honest
    // line is what the assertion pins now.
    //
    // `probeFormat` stays optional and still defaults to a probe that answers
    // nothing — but NOT for the reason it would be tempting to write down. This
    // page is exported from no barrel and has one consumer
    // (`shell/FullscreenView`), which always passes `derived.formats.probe`;
    // `useFormatCatalog` always returns that as a function. So the degraded
    // case reaches this surface through the TRANSPORT, never through an omitted
    // prop, and `NO_PROBE` is reachable only from this harness. The default
    // stays because it keeps the answer-less state expressible in a test
    // without a fake transport, and because omitting the prop is now VISIBLE
    // rather than silent.
    render(<Harness noProbe />);
    openSection('Display formats');
    fireEvent.click(screen.getByRole('button', { name: 'Choose the Date format' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write a pattern…' }));
    expect(await screen.findByLabelText('Pattern')).toBeTruthy();
    expect(screen.getByText('The preview and the token buttons are unavailable.')).toBeTruthy();
    expect(screen.queryByText('Press a token above, or type a pattern.')).toBeNull();
  });

  it('summarizes an unset base text by size alone (no family to name)', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /^Normal text/ }).textContent).toContain('10pt');
  });

  it('previews the base text in the aside on the normal-text section', () => {
    render(<Harness defaultFontFamily="biz-udp-gothic" pages={[page()]} />);
    openSection('Normal text');
    expect(screen.getByText('Text with no style of its own is set like this.')).toBeTruthy();
    // The page preview steps aside — the section's subject is the text itself.
    expect(document.querySelectorAll('canvas').length).toBe(0);
  });

  it('shows the engine fallback as the family placeholder, not as a value', () => {
    render(<Harness defaultFontFamily="biz-udp-gothic" />);
    openSection('Normal text');
    const input = screen.getByLabelText('Font family') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.getAttribute('placeholder')).toBe('biz-udp-gothic');
  });

  it('shows a no-preview note when there are no rendered pages', () => {
    render(<Harness pages={[]} />);
    expect(screen.getByText('No preview yet.')).toBeTruthy();
  });

  it('renders one preview canvas per rendered page', () => {
    const { container } = render(<Harness pages={[page(), page()]} />);
    expect(container.querySelectorAll('canvas').length).toBe(2);
    expect(screen.queryByText('No preview yet.')).toBeNull();
  });

  it('fires onClose from the close button', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the focused section, and re-selects it on a new nonce', () => {
    function Wrapper() {
      const [nonce, setNonce] = useState(1);
      return (
        <>
          <Harness focus={{ section: 'styles', nonce }} />
          <button type="button" onClick={() => setNonce((n) => n + 1)}>
            bump
          </button>
        </>
      );
    }
    render(<Wrapper />);
    expect(screen.getByRole('heading', { name: 'Styles' })).toBeTruthy();
    // Navigate away, then bump the nonce: a repeat jump to the SAME section
    // still fires (the nonce is the trigger, not the section value).
    openSection('Page setup');
    expect(screen.queryByRole('heading', { name: 'Styles' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    expect(screen.getByRole('heading', { name: 'Styles' })).toBeTruthy();
  });

  it('opens at page setup when no focus is given', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Page setup' })).toBeTruthy();
  });

  it('renders over a hostile/malformed document without throwing', () => {
    // A non-map body still renders the settings shell + seeds.
    render(<Harness source={'sections: not-a-map\n'} />);
    expect(screen.getByRole('heading', { name: 'Page setup' })).toBeTruthy();
    openSection('Normal text');
    const lineHeight = screen.getByLabelText('Line height') as HTMLInputElement;
    expect(lineHeight.value).toBe('');
    expect(lineHeight.getAttribute('placeholder')).toBe('1.4');
  });

  it('renders seeds over an alias-bomb defaults subtree (guarded read → empty)', () => {
    // The `defaults:` subtree is an alias bomb: the editor's capped read
    // materializes it as empty, so the view shows the engine-default seeds
    // instead of throwing or hanging.
    const bomb = [
      'seed: &x [1, 1, 1, 1, 1, 1, 1, 1]',
      `defaults: { style: { fontSize: [${Array(80).fill('*x').join(', ')}] } }`,
      BASE.trimEnd(),
      '',
    ].join('\n');
    render(<Harness source={bomb} />);
    expect(screen.getByRole('heading', { name: 'Page setup' })).toBeTruthy();
    openSection('Normal text');
    // Nothing survives the capped read, so every field reads unset — and shows
    // the engine fallback as its placeholder rather than as an authored value.
    for (const [label, fallback] of [
      ['Line height', '1.4'],
      ['Font size', '10'],
    ]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe('');
      expect(input.getAttribute('placeholder')).toBe(fallback);
    }
  });
});

describe('the locale facts reach the panel that shows them', () => {
  // The THREADING, which no pure-model test can see: the engine's answer
  // crosses four components to reach the sentence a reader gets, and a prop
  // dropped anywhere along the way fails silently — the panel simply explains
  // nothing, with every gate green. That is the shape of defect this whole
  // change exists to remove one layer down, so it gets its own pin.
  const FACTS: LocaleFacts = {
    id: 'ja-JP',
    date: '2026/11/03(火)',
    number: '12,345,678.9',
    currencyDefault: 'JPY',
    amount: '1,234,568',
  };

  it('shows the engine’s samples once the section is open', () => {
    render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} localeFacts={FACTS} />);
    openSection('Locale & currency');
    expect(screen.getByText(/2026\/11\/03\(火\)/)).toBeTruthy();
    expect(screen.getByText(/1,234,568/)).toBeTruthy();
  });

  it('says nothing about the pick when the engine has not answered', () => {
    render(<Harness source={`defaults:\n  locale: ja-JP\n${BASE}`} />);
    openSection('Locale & currency');
    expect(screen.queryByText(/2026/)).toBeNull();
  });
});
