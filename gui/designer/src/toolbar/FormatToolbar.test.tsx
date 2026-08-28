import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { buildStyleUsage } from '../styles/usage';
import { swatchLabel } from '../testkit/swatchLabel';
import { FormatToolbar } from './FormatToolbar';

const PATH = 'sections.body.items[0]';

/** A harness over the REAL editor: applying an op mutates the document and
 * re-renders, so tests assert the serialized doc (not a spy) and the toolbar's
 * reflected state. The `<pre>` exposes the current YAML. */
function Harness({
  source,
  path = PATH,
  fontFamilies,
  locale = 'en',
  capabilities,
  floor,
}: {
  readonly source: string;
  readonly path?: string | null;
  readonly fontFamilies?: readonly string[];
  readonly locale?: string;
  readonly capabilities?: readonly string[];
  readonly floor?: Readonly<Record<string, unknown>>;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale={locale}>
      <FormatToolbar
        controller={editor}
        path={path}
        fontFamilies={fontFamilies}
        usage={buildStyleUsage(editor.text)}
        capabilities={capabilities}
        floor={floor}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

const TEXT_SRC = `styles:
  heading: { fontSize: 20 }
  unused: { color: "#ff0000" }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: [heading] }
`;

const RECT_SRC = `styles:
  framed: { borderWidth: 1 }
sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 } }
`;

const QR_SRC = `sections:
  body:
    type: flow
    items:
      - { type: qr_code, data: { key: url } }
`;

describe('FormatToolbar — per-type controls', () => {
  it('shows the full control set for a text item', () => {
    render(<Harness source={TEXT_SRC} fontFamilies={['gf-lato']} />);
    expect(screen.getByLabelText('Font family')).toBeTruthy();
    expect(screen.getByLabelText('Font size')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alignment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text color' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Styles' })).toBeTruthy();
  });

  it('shows the engine-default size (10) for an unset item over a floor', () => {
    const UNSET = `sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`;
    render(<Harness source={UNSET} floor={{ fontSize: '10', fontFamily: 'biz-udp-gothic' }} />);
    // The size box reflects the engine-default floor instead of reading blank.
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('10');
  });

  it('shows fill color + border + styles for a rect (no typography)', () => {
    render(<Harness source={RECT_SRC} />);
    expect(screen.queryByLabelText('Font family')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fill' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Border' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Styles' })).toBeTruthy();
  });

  it('shows fill + border for a qr_code (boxed item, no typography)', () => {
    const { container } = render(<Harness source={QR_SRC} />);
    expect(container.querySelector('.sj-format-toolbar-body')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Fill' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Border' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('renders nothing for a non-boxed line item', () => {
    const { container } = render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: line, box: { w: 50, h: 0 } }
`}
      />,
    );
    expect(container.querySelector('.sj-format-toolbar-body')).toBeNull();
  });

  it('renders nothing for no selection', () => {
    const { container } = render(<Harness source={TEXT_SRC} path={null} />);
    expect(container.querySelector('.sj-format-toolbar-body')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('renders nothing for a ghost selection (removed node)', () => {
    const { container } = render(<Harness source={TEXT_SRC} path="sections.body.items[9]" />);
    expect(container.querySelector('.sj-format-toolbar-body')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });
});

describe('FormatToolbar — bold / italic toggles', () => {
  it('sets fontWeight on the document and reflects the pressed state', () => {
    render(<Harness source={TEXT_SRC} />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold.getAttribute('aria-pressed')).toBe('false');
    // No cascade hint → the hover tooltip still names the action.
    expect(bold.parentElement?.querySelector('.sj-tip')?.textContent).toBe('Bold');
    fireEvent.click(bold);
    expect(doc()).toContain('fontWeight: bold');
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the fontWeight key on a second click (never authors normal)', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(doc()).not.toContain('fontWeight');
  });

  it('presses bold for a style-driven bold, with the origin hint, and unpressing overrides', () => {
    render(
      <Harness
        source={`styles:
  strong: { fontWeight: bold }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: [strong] }
`}
      />,
    );
    // The EFFECTIVE state shows (the item renders bold via its named style),
    // and the hint says where it comes from.
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    expect(bold.parentElement?.querySelector('.sj-tip')?.textContent).toBe(
      'Bold — From style "strong"',
    );
    // Unpressing cannot remove the style's key — it authors the ONE possible
    // override on the item itself.
    fireEvent.click(bold);
    expect(doc()).toContain('fontWeight: normal');
    // Pressing again just drops the now-redundant override (never a restated
    // bold beside the style) — the registry's own fontWeight stays.
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(doc()).not.toContain('fontWeight: normal');
    expect(doc()).toContain('- { type: text, text: hi, styleNames: [ strong ] }');
  });

  it('hints an inherited value (container ancestor) on the control', () => {
    render(
      <Harness
        path="sections.body.items[0].items[0]"
        source={`sections:
  body:
    type: flow
    items:
      - type: container
        style: { fontStyle: italic }
        items:
          - { type: text, text: hi }
`}
      />,
    );
    const italic = screen.getByRole('button', { name: 'Italic' });
    expect(italic.getAttribute('aria-pressed')).toBe('true');
    expect(italic.parentElement?.querySelector('.sj-tip')?.textContent).toBe(
      'Italic — Inherited from the level above',
    );
  });

  it('hints a document-defaults value on the control', () => {
    render(
      <Harness
        source={`defaults:
  style: { fontFamily: biz-udp-gothic }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`}
      />,
    );
    const family = screen.getByLabelText('Font family');
    expect(family.textContent).toContain('biz-udp-gothic');
    expect(family.parentElement?.querySelector('.sj-tip')?.textContent).toBe(
      'Font family — From document defaults',
    );
  });

  it('clicking the default-active Left alignment on an unset item writes nothing', () => {
    render(<Harness source={TEXT_SRC} />);
    // Unset alignment: the engine default `left` shows as the active state.
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    const left = screen.getByRole('menuitemradio', { name: 'Align left' });
    expect(left.getAttribute('aria-checked')).toBe('true');
    const before = doc();
    fireEvent.click(left);
    expect(doc()).toBe(before);
  });

  it('toggles italic on the document', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(doc()).toContain('fontStyle: italic');
  });
});

describe('FormatToolbar — alignment dropdown', () => {
  it('sets an alignment from the dropdown, then clears it when the active one is picked again', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align center' }));
    expect(doc()).toContain('textAlign: center');
    // The trigger now shows the active glyph; re-opening checks the row.
    expect(screen.getByRole('button', { name: 'Alignment' }).getAttribute('data-align')).toBe(
      'center',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    expect(
      screen.getByRole('menuitemradio', { name: 'Align center' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align center' }));
    expect(doc()).not.toContain('textAlign');
  });

  it('falls back to the left glyph on a non-enum authored textAlign', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { textAlign: justify } }
`}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Alignment' });
    expect(trigger.getAttribute('data-align')).toBe('left');
    // No dropdown row claims the unknown value as checked.
    fireEvent.click(trigger);
    for (const name of ['Align left', 'Align center', 'Align right']) {
      expect(screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked')).toBe(
        'false',
      );
    }
  });
});

describe('FormatToolbar — font family dropdown', () => {
  it('shows the placeholder on the trigger when no family resolves anywhere', () => {
    render(<Harness source={TEXT_SRC} fontFamilies={['gf-lato']} />);
    const family = screen.getByLabelText('Font family');
    expect(family.textContent).toContain('Font family');
  });

  it('picks a family from the menu and writes it to the document', () => {
    render(<Harness source={TEXT_SRC} fontFamilies={['gf-lato']} />);
    fireEvent.click(screen.getByLabelText('Font family'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'gf-lato' }));
    expect(doc()).toContain('fontFamily: gf-lato');
    // The trigger now shows the picked family, and re-opening checks its row.
    expect(screen.getByLabelText('Font family').textContent).toContain('gf-lato');
    fireEvent.click(screen.getByLabelText('Font family'));
    expect(
      screen.getByRole('menuitemradio', { name: 'gf-lato' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('marks the checked row with a decorative check icon, not a text glyph', () => {
    render(<Harness source={TEXT_SRC} fontFamilies={['gf-lato']} />);
    fireEvent.click(screen.getByLabelText('Font family'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'gf-lato' }));
    fireEvent.click(screen.getByLabelText('Font family'));
    const row = screen.getByRole('menuitemradio', { name: 'gf-lato' });
    // The mark is an SVG the accessible name cannot pick up, so the row's
    // name stays the family alone and nothing is announced twice.
    expect(row.querySelector('svg')).not.toBeNull();
    expect(row.querySelector('[aria-hidden="true"] svg, [aria-hidden] svg')).not.toBeNull();
    expect(row.textContent).toBe('gf-lato');
  });

  it('writes nothing when the current family is picked again', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontFamily: gf-lato } }
`}
        fontFamilies={['gf-lato']}
      />,
    );
    const before = doc();
    fireEvent.click(screen.getByLabelText('Font family'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'gf-lato' }));
    expect(doc()).toBe(before);
  });

  it('lists the current family even when the host offers no options', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontFamily: own-face } }
`}
      />,
    );
    fireEvent.click(screen.getByLabelText('Font family'));
    expect(
      screen.getByRole('menuitemradio', { name: 'own-face' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('offers the add-font tail when the host wires one, and dispatches it', () => {
    const onAddFont = vi.fn();
    render(<HarnessWithAddFont onAddFont={onAddFont} fontFamilies={['gf-lato']} />);
    fireEvent.click(screen.getByLabelText('Font family'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add font…' }));
    expect(onAddFont).toHaveBeenCalledTimes(1);
    // Picking the tail closes the menu.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the add-font tail without a divider when the menu has no rows', () => {
    const onAddFont = vi.fn();
    render(<HarnessWithAddFont onAddFont={onAddFont} />);
    fireEvent.click(screen.getByLabelText('Font family'));
    expect(screen.getByRole('menuitem', { name: 'Add font…' })).toBeTruthy();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });

  it('renders no family dropdown when there is nothing to offer', () => {
    // No host options, no family resolving anywhere, no add-font flow → an
    // empty menu would be a dead control; the panel keeps the free-text path.
    render(<Harness source={TEXT_SRC} />);
    expect(screen.queryByLabelText('Font family')).toBeNull();
  });

  it('hides the add-font tail when the host wires none', () => {
    render(<Harness source={TEXT_SRC} fontFamilies={['gf-lato']} />);
    fireEvent.click(screen.getByLabelText('Font family'));
    expect(screen.queryByRole('menuitem', { name: 'Add font…' })).toBeNull();
  });
});

describe('FormatToolbar — font size', () => {
  it('commits a changed font size on blur', () => {
    render(<Harness source={TEXT_SRC} />);
    const size = screen.getByLabelText('Font size') as HTMLInputElement;
    fireEvent.blur(size, { target: { value: '18' } });
    expect(doc()).toContain('fontSize: 18');
  });

  it('writes nothing when the size is blurred without a change (tab-through guard)', () => {
    render(<Harness source={TEXT_SRC} />);
    const before = doc();
    fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '20' } });
    expect(doc()).toBe(before);
  });

  it('steps the size up and down by 1pt (gdoc − n +)', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase font size' }));
    expect(doc()).toContain('fontSize: 21');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }));
    expect(doc()).toContain('fontSize: 19');
  });

  it('steps a fractional size cleanly (10.5 → 11.5)', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontSize: 10.5 } }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Increase font size' }));
    expect(doc()).toContain('fontSize: 11.5');
  });

  it('floors a step-down at 1pt', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontSize: 1 } }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }));
    expect(doc()).toContain('fontSize: 1');
  });

  it('disables the steppers when no plain-number size resolves', () => {
    render(<Harness source={CAPTURE_ONLY_SRC} />);
    const up = screen.getByRole('button', { name: 'Increase font size' }) as HTMLButtonElement;
    const down = screen.getByRole('button', { name: 'Decrease font size' }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(true);
  });
});

/** A harness variant threading `onAddFont` (the host's add-font flow). */
function HarnessWithAddFont({
  onAddFont,
  fontFamilies,
}: {
  readonly onAddFont: () => void;
  readonly fontFamilies?: readonly string[];
}) {
  const editor = useEditor(TEXT_SRC);
  return (
    <I18nProvider locale="en">
      <FormatToolbar
        controller={editor}
        path={PATH}
        fontFamilies={fontFamilies}
        usage={buildStyleUsage(editor.text)}
        onAddFont={onAddFont}
      />
    </I18nProvider>
  );
}

describe('FormatToolbar — color popover', () => {
  it('opens the swatch popover and writes the picked color, then closes', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(doc()).toMatch(/color:\s*['"]#b91c1c['"]/);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape without writing', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    const before = doc();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(doc()).toBe(before);
  });

  it('closes on a pointer press outside, but not on one inside', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    // A press inside the popover leaves it open.
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ignores non-Escape keys while the popover is open', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('writes nothing when the custom picker is blurred at its seed value', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    const before = doc();
    const custom = screen.getByLabelText('Custom') as HTMLInputElement;
    // Blur without changing from the seed (#000000 for an unset color).
    fireEvent.blur(custom, { target: { value: '#000000' } });
    expect(doc()).toBe(before);
  });

  it('commits a custom color on blur and clears it via the clear action', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    const custom = screen.getByLabelText('Custom') as HTMLInputElement;
    fireEvent.blur(custom, { target: { value: '#00ff00' } });
    expect(doc()).toMatch(/color:\s*['"]#00ff00['"]/);
    // Re-open and clear — the item's own color key goes away (the registry's
    // unrelated color stays, so assert on the value the item carried).
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(doc()).not.toContain('#00ff00');
  });

  it('does not paint the swatch preview from a non-hex (hostile) current value', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { color: "url(javascript:alert(1))" } }
`}
      />,
    );
    const preview = screen
      .getByRole('button', { name: 'Text color' })
      .querySelector('.sj-color-chip') as HTMLElement;
    expect(preview.style.backgroundColor).toBe('');
  });

  it('writes fill (backgroundColor) for a rect color control', () => {
    render(<Harness source={RECT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#1d4ed8') }));
    expect(doc()).toMatch(/backgroundColor:\s*['"]#1d4ed8['"]/);
  });
});

describe('FormatToolbar — style picker', () => {
  it('shows the applied style name on the trigger (gdoc-style)', () => {
    render(<Harness source={TEXT_SRC} />);
    expect(screen.getByRole('button', { name: 'Styles' }).textContent).toContain('heading');
  });

  it('shows the normal-text placeholder on the trigger when no style is applied', () => {
    render(
      <Harness
        source={`styles:
  heading: { fontSize: 20 }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`}
      />,
    );
    expect(screen.getByRole('button', { name: 'Styles' }).textContent).toContain('Normal text');
  });

  it('shows a used style with its impact count and an unused one without', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    const heading = screen.getByRole('menuitemcheckbox', { name: /heading/ });
    expect(heading.getAttribute('aria-checked')).toBe('true');
    expect(heading.textContent).toContain('Used in 1 place');
    const unused = screen.getByRole('menuitemcheckbox', { name: /unused/ });
    expect(unused.getAttribute('aria-checked')).toBe('false');
    expect(unused.textContent).not.toContain('Used in');
  });

  it('toggles a style name off in one op (undo reverts in one step)', () => {
    render(<Harness source={TEXT_SRC} />);
    const before = doc();
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /heading/ }));
    expect(doc()).not.toContain('styleNames');
    // ONE undo step restores the document byte-exactly — the toggle was a
    // single op, never a multi-op sequence.
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(before);
  });

  it('toggles a style name on in one op, appended after the existing names', () => {
    render(<Harness source={TEXT_SRC} />);
    const before = doc();
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /unused/ }));
    expect(doc()).toMatch(/styleNames:\s*\[\s*heading,\s*unused\s*\]/);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(before);
  });

  it('renders a hostile style name as text, not markup', () => {
    render(
      <Harness
        source={`styles:
  "<img src=x onerror=bad>": { color: "#000000" }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    expect(screen.getByText('<img src=x onerror=bad>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders each option name in a preview of its own style (gdoc-style)', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    const menu = within(screen.getByRole('menu'));
    // `heading: { fontSize: 20 }` → the name reads at its own size.
    expect(menu.getByText('heading').style.fontSize).toBe('20px');
    // `unused: { color: "#ff0000" }` → the name reads in its own color.
    expect(menu.getByText('unused').style.color).toBeTruthy();
  });

  it('previews a bold style name in bold', () => {
    render(
      <Harness
        source={`styles:
  strong: { fontWeight: bold, fontStyle: italic }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: [strong] }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    const preview = within(screen.getByRole('menu')).getByText('strong');
    expect(preview.style.fontWeight).toBe('bold');
    expect(preview.style.fontStyle).toBe('italic');
  });

  it('previews plain for a dangling styleName absent from the registry', () => {
    render(
      <Harness
        source={`styles:
  heading: { fontSize: 20 }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: [ghost] }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    // No registry entry → no preview style applied, just plain text (no crash).
    expect(screen.getByText('ghost').getAttribute('style')).toBeNull();
  });

  it('looks up a prototype-named style safely (own entry only, no crash)', () => {
    // A hostile registry key that shadows Object.prototype must resolve to its
    // OWN authored props via the Map lookup, never an inherited Function.
    render(
      <Harness
        source={`styles:
  constructor: { fontStyle: italic }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: [constructor] }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    const preview = within(screen.getByRole('menu')).getByText('constructor');
    expect(preview.style.fontStyle).toBe('italic');
  });

  it('handles a toString-named style safely (own entry, no crash)', () => {
    render(
      <Harness
        source={`styles:
  toString: { fontWeight: bold }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: [toString] }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    expect(within(screen.getByRole('menu')).getByText('toString').style.fontWeight).toBe('bold');
  });

  it('does not pollute Object.prototype from a __proto__ style name', () => {
    // A `__proto__` registry key must never reach a prototype write: the Map
    // lookup + readStylesView projection both use own-key iteration. The name
    // is referenced so the row shows regardless of how the parser treats the
    // key (own vs prototype), exercising the preview lookup either way.
    render(
      <Harness
        source={`styles:
  __proto__: { color: "#010203" }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, styleNames: ["__proto__"] }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    // The row renders (no crash) and no global prototype pollution occurred.
    expect(within(screen.getByRole('menu')).getByText('__proto__')).toBeTruthy();
    expect(({} as Record<string, unknown>).color).toBeUndefined();
  });

  it('hides the style picker when the registry is empty and the item has no names', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Styles' })).toBeNull();
  });

  it('shows no usage counts when the usage index is null (unmaterialized doc)', () => {
    const controller: EditorController = {
      text: '',
      revision: 0,
      selection: null,
      canUndo: false,
      canRedo: false,
      apply: vi.fn(() => ({ ok: true as const })),
      applyAll: vi.fn(() => ({ ok: true as const })),
      read: (path: string) =>
        path === 'styles'
          ? { heading: {} }
          : path === PATH
            ? { type: 'text', text: 'hi', styleNames: ['heading'] }
            : undefined,
      undo: vi.fn(),
      redo: vi.fn(),
      select: vi.fn(),
      clearSelection: vi.fn(),
      setMaxBytes: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      replaceDocument: vi.fn(),
    };
    render(
      <I18nProvider locale="en">
        <FormatToolbar controller={controller} path={PATH} usage={null} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    const heading = screen.getByRole('menuitemcheckbox', { name: /heading/ });
    expect(heading.textContent).not.toContain('Used in');
  });
});

const STYLED_SRC = `styles:
  heading: { fontSize: 20 }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontWeight: bold }, styleNames: [heading] }
`;

// A capturable item with no registry and no applied style.
const CAPTURE_ONLY_SRC = `sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontWeight: bold } }
`;

describe('FormatToolbar — style capture', () => {
  const SAVE_AS = 'Save formatting as a style…';

  it('offers "save as style" only when the selection has a capturable prop', () => {
    render(<Harness source={STYLED_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    expect(screen.getByRole('menuitem', { name: SAVE_AS })).toBeTruthy();
  });

  it('hides "save as style" when the selection has no inline formatting', () => {
    render(<Harness source={TEXT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    expect(screen.queryByRole('menuitem', { name: SAVE_AS })).toBeNull();
  });

  it('offers "update to match" naming the applied style, when one is applied', () => {
    render(<Harness source={STYLED_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    expect(
      screen.getByRole('menuitem', { name: 'Update "heading" to match selection…' }),
    ).toBeTruthy();
  });

  it('hides "update to match" when no real style is applied', () => {
    render(<Harness source={CAPTURE_ONLY_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    expect(screen.getByRole('menuitem', { name: SAVE_AS })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Update/ })).toBeNull();
  });

  it('shows the picker for a capturable item even with an empty registry', () => {
    render(<Harness source={CAPTURE_ONLY_SRC} />);
    expect(screen.getByRole('button', { name: 'Styles' })).toBeTruthy();
  });

  it('hides the picker when there is nothing to toggle AND nothing to capture', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Styles' })).toBeNull();
  });

  it('captures the selection into a new style in one undo step', () => {
    render(<Harness source={CAPTURE_ONLY_SRC} />);
    const before = doc();
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    fireEvent.click(screen.getByRole('menuitem', { name: SAVE_AS }));
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    const text = doc();
    // The captured formatting moved INTO the new named style…
    expect(text).toMatch(/Title:\s*\n\s*fontWeight: bold/);
    // …and the item now carries only the style reference, no inline style map.
    expect(text).toContain('text: hi, styleNames: [ Title ] }');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(before);
  });

  it('drops an open capture modal when the selection moves to another item', () => {
    render(<CaptureSwitchHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    fireEvent.click(screen.getByRole('menuitem', { name: SAVE_AS }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // The selection moves (e.g. an undo removed the item and the user picked
    // another) — the stale capture state must NOT resurrect the modal against
    // the new item.
    fireEvent.click(screen.getByTestId('switch'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('updates the applied style to match the selection in one undo step', () => {
    render(
      <Harness
        source={`styles:
  heading: { fontSize: 20 }
sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontSize: 30 }, styleNames: [heading] }
`}
      />,
    );
    const before = doc();
    fireEvent.click(screen.getByRole('button', { name: 'Styles' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Update "heading" to match selection…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    // The registry entry took the drifted size; the inline override is gone.
    expect(doc()).toMatch(/heading:\s*{\s*fontSize:\s*30\s*}/);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(before);
  });
});

/** Two capturable items + a button that moves the selection between them. */
function CaptureSwitchHarness() {
  const editor = useEditor(`sections:
  body:
    type: flow
    items:
      - { type: text, text: a, style: { fontWeight: bold } }
      - { type: text, text: b, style: { fontStyle: italic } }
`);
  const [path, setPath] = useState(PATH);
  return (
    <I18nProvider locale="en">
      <FormatToolbar controller={editor} path={path} usage={buildStyleUsage(editor.text)} />
      <button type="button" data-testid="switch" onClick={() => setPath('sections.body.items[1]')}>
        switch
      </button>
    </I18nProvider>
  );
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="ja">{node}</I18nProvider>);
}

const TABLE_SRC = `sections:
  body:
    type: flow
    items:
      - { type: table, data: { key: rows }, columns: [{ label: A }] }
`;

describe('FormatToolbar — border control', () => {
  it('opens a popover with the Excel-style editor and its presets', () => {
    render(<Harness source={RECT_SRC} />);
    const border = screen.getByRole('button', { name: 'Border' });
    // The trigger names itself on hover (gdoc instant tooltip).
    expect(border.parentElement?.querySelector('.sj-tip')?.textContent).toBe('Border');
    fireEvent.click(border);
    expect(screen.getByRole('button', { name: 'All sides' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'None' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Top border' })).toBeTruthy();
  });

  it('applies an outer frame to a table in one click (one undo step)', () => {
    render(<Harness source={TABLE_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Border' }));
    // The table note explains the outer-frame-only behavior.
    expect(screen.getByText('On a table this draws the outer frame only.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderWidth: 1');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('borderWidth');
  });

  it('toggles one edge on a rect via the diagram', () => {
    render(<Harness source={RECT_SRC} />);
    fireEvent.click(screen.getByRole('button', { name: 'Border' }));
    const top = screen.getByRole('button', { name: 'Top border' });
    expect(top.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(top);
    expect(doc()).toContain('top: 1');
  });

  it('hides the border control entirely when the engine lacks style.border', () => {
    render(<Harness source={RECT_SRC} capabilities={['style.backgroundColor']} />);
    expect(screen.queryByRole('button', { name: 'Border' })).toBeNull();
    // Fill still shows (its own capability is present).
    expect(screen.getByRole('button', { name: 'Fill' })).toBeTruthy();
  });

  it('gates the per-side matrix and line-style select by capability', () => {
    render(<Harness source={RECT_SRC} capabilities={['style.border']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Border' }));
    // No per-side cap → no edge matrix, presets only.
    expect(screen.queryByRole('button', { name: 'Top border' })).toBeNull();
    expect(screen.getByRole('button', { name: 'All sides' })).toBeTruthy();
    // No borderStyle cap → no line-type select.
    expect(screen.queryByLabelText('Line type')).toBeNull();
    expect(screen.getByLabelText('Line color')).toBeTruthy();
  });
});

describe('FormatToolbar — localization', () => {
  it('renders Japanese control labels', () => {
    draw(<FormatToolbarProbe />);
    expect(screen.getByRole('button', { name: '太字' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '文字色' })).toBeTruthy();
  });
});

/** A ja probe over the real editor (kept tiny — just enough to render labels). */
function FormatToolbarProbe() {
  const editor = useEditor(TEXT_SRC);
  return <FormatToolbar controller={editor} path={PATH} usage={buildStyleUsage(editor.text)} />;
}

describe('FormatToolbar — a selected table column', () => {
  // A column is not an item and its `type` is an OPTIONAL default, so the
  // toolbar used to appear for a column that spelled `type: text` out and
  // vanish for one that relied on the default — the same column either way,
  // keyed on a value that changes nothing about what is drawn.
  const TABLE_SRC = `sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        columns:
          - { label: 品名, data: { key: name } }
          - { label: 金額, data: { key: amount } }
`;
  const COLUMN = 'sections.body.items[0].columns[1]';

  it('formats a column that omits `type`, which is what the scaffold emits', () => {
    render(<Harness source={TABLE_SRC} path={COLUMN} />);
    expect(screen.getByRole('button', { name: 'Bold' })).not.toBeNull();
  });

  it('authors an alignment at that column’s own style', () => {
    render(<Harness source={TABLE_SRC} path={COLUMN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align right' }));
    expect(doc()).toContain('textAlign: right');
    // The sibling column is untouched.
    expect(doc()).toContain('{ label: 品名, data: { key: name } }');
  });

  it('authors bold at that column’s own style', () => {
    render(<Harness source={TABLE_SRC} path={COLUMN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(doc()).toContain('fontWeight: bold');
  });

  it('reads the ROW BAND as the column’s cascade, not as unset', () => {
    // The engine resolves a body cell over `resolve_row_style(&table.row, …)`
    // — `row.style` over the table's own style — and `textAlign` is inherited.
    // Without those layers the toolbar showed Left active on a right-aligned
    // cell, and clicking Left did nothing at all: `alignOp` reads a click on the
    // ACTIVE option as revert-to-cascade, and the cascade read empty.
    const banded = TABLE_SRC.replace(
      '        data: { key: rows }',
      '        data: { key: rows }\n        row:\n          style: { textAlign: right }',
    );
    render(<Harness source={banded} path={COLUMN} />);
    expect(screen.getByRole('button', { name: 'Alignment' }).getAttribute('data-align')).toBe(
      'right',
    );
  });

  it('drops a column’s own alignment that merely restates the row band', () => {
    const banded = TABLE_SRC.replace(
      '        data: { key: rows }',
      '        data: { key: rows }\n        row:\n          style: { textAlign: right }',
    ).replace(
      '          - { label: 金額, data: { key: amount } }',
      '          - label: 金額\n            data: { key: amount }\n            style: { textAlign: right }',
    );
    render(<Harness source={banded} path={COLUMN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    // Two `textAlign`s to start with: the row band's and the column's.
    expect(doc().match(/textAlign/g)).toHaveLength(2);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align right' }));
    // The cascade already yields `right`, so the COLUMN's own key is redundant
    // and goes — the row band's stays, which is what makes the cell still right.
    expect(doc().match(/textAlign/g)).toHaveLength(1);
    expect(doc()).toContain('style: { textAlign: right }');
  });

  it('authors a column alignment that DIFFERS from the row band', () => {
    const banded = TABLE_SRC.replace(
      '        data: { key: rows }',
      '        data: { key: rows }\n        row:\n          style: { textAlign: right }',
    );
    render(<Harness source={banded} path={COLUMN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align left' }));
    expect(doc()).toContain('textAlign: left');
  });

  it('authors a column TEXT COLOUR at the column’s own style', () => {
    render(<Harness source={TABLE_SRC} path={COLUMN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(doc()).toContain('color: "#b91c1c"');
  });

  it('reverts the column to the cascade when the ACTIVE alignment is clicked again', () => {
    // The toolbar's shipped contract: clicking the active option is the
    // revert-to-cascade toggle, so the column's own key goes away rather than
    // being restated. Pinned at the column path because that path is new.
    const aligned = TABLE_SRC.replace(
      '          - { label: 金額, data: { key: amount } }',
      '          - label: 金額\n            data: { key: amount }\n            style: { textAlign: right }',
    );
    render(<Harness source={aligned} path={COLUMN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alignment' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Align right' }));
    expect(doc()).not.toContain('textAlign');
    expect(doc()).toContain('data: { key: amount }');
  });
});

// The toolbar size box carries the same commit-on-blur blind spot as the
// panel's fields, and it is the control the panel fix was modelled on (gdoc's
// own size box reverts silently). It sits outside `panel/`, which is why a
// panel-scoped sweep of the defect did not reach it.

describe('FormatToolbar — font size refusal snap-back', () => {
  const UNSET = `sections:
  body:
    type: flow
    items:
      - { type: text, text: hi }
`;
  const size = () => screen.getByLabelText('Font size') as HTMLInputElement;

  it('takes back a cleared size over an INHERITED value, which authors nothing', () => {
    // `comboWire` refuses when the box is emptied on an item with no own
    // fontSize: there is no key to remove, so nothing is authored — and the
    // blank used to stay on screen over a page still rendering at 10pt.
    render(<Harness source={UNSET} floor={{ fontSize: '10', fontFamily: 'biz-udp-gothic' }} />);
    const before = doc();
    fireEvent.blur(size(), { target: { value: '   ' } });
    expect(doc()).toBe(before);
    expect(size().value).toBe('10');
  });

  it('leaves the box alone on a tab-through that changes nothing', () => {
    render(<Harness source={TEXT_SRC} />);
    const before = size();
    fireEvent.blur(before, { target: { value: '20' } });
    expect(size()).toBe(before);
  });

  it('still clears an OWN size, which is a real edit rather than a refusal', () => {
    // An OWN `fontSize` on the item, not one inherited from a style — those
    // are the two sides of `comboWire`'s guard, and only the inherited side
    // refuses. Snapping back here would silently undo a real clear.
    const OWN = `sections:
  body:
    type: flow
    items:
      - { type: text, text: hi, style: { fontSize: 14 } }
`;
    render(<Harness source={OWN} />);
    expect(size().value).toBe('14');
    fireEvent.blur(size(), { target: { value: '' } });
    expect(doc()).not.toContain('fontSize: 14');
  });

  it('steps from the committed size after a refused entry', () => {
    render(<Harness source={UNSET} floor={{ fontSize: '10', fontFamily: 'biz-udp-gothic' }} />);
    fireEvent.blur(size(), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Increase font size' }));
    expect(doc()).toContain('fontSize: 11');
  });
});
