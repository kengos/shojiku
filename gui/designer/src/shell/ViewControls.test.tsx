// Designer-level tests for the slim toolbar's grouping (shell/ViewControls.tsx
// + the shared `ui/Sep` rule).
//
// The invariant is not "there are N rules" — it is that each group owns its
// LEADING rule, so a group that does not render can never leave two rules
// adjacent. Both halves are asserted: the count moves with the conditional
// group, and no two rules are ever siblings.
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ImageCodec } from '../image/import';
import { buildSampleSet } from '../sample/variants';
import { draw, makeTransport } from '../testkit/harness';

const TWO = buildSampleSet(JSON.stringify({ title: 'A' }), [
  { id: 'blank', name: { en: 'Blank' }, text: JSON.stringify({ title: 'B' }) },
]);

/** A template carrying an image item — what turns the capacity readout on
 * (`useImageImport` keys `hasImageItem` off the wire spelling). */
const WITH_IMAGE = [
  'version: 0.1.0',
  'sections:',
  '  body:',
  '    items:',
  '      - type: image',
  '        src: logo.png',
  '',
].join('\n');

function fakeCodec(): ImageCodec {
  return {
    read: async () => new Uint8Array(),
    probe: async () => ({ w: 10, h: 10 }),
    reencode: async () => new Uint8Array(),
  };
}

/** The group rules inside the slim toolbar. `ui/Sep` is the only thing that
 * mints this shape (gated in `ui/chromeConvention.test.ts`), so querying the
 * class is querying the primitive. */
function rules(): HTMLElement[] {
  return [...screen.getByRole('toolbar').querySelectorAll<HTMLElement>('span.w-px')];
}

describe('slim-toolbar grouping', () => {
  it('divides the groups with a rule, and hides every rule from assistive tech', () => {
    draw(makeTransport());
    const found = rules();
    // Undo/redo | grid | zoom on the baseline fixture: three groups, two of
    // which own a leading rule.
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const rule of found) {
      expect(rule.getAttribute('aria-hidden')).toBe('true');
      expect(rule.textContent).toBe('');
    }
  });

  it("puts each group's rule immediately before the group", () => {
    // The count and the adjacency rule below both pass for a bar whose rules
    // sit in the wrong PLACES — this is the half that says the divisions fall
    // on the group boundaries the reader is meant to see.
    draw(makeTransport(), { sampleSet: TWO, imageCodec: fakeCodec(), source: WITH_IMAGE });
    const bar = screen.getByRole('toolbar');
    const children = [...bar.children];
    // Undo/redo lead the bar and own no rule — the first group never does.
    expect(children[0]?.classList.contains('w-px')).toBe(false);
    // Each later group named by a control INSIDE it, so the assertion does not
    // ride on a group's rendered text.
    const groups: readonly (readonly [string, Element | null])[] = [
      ['grid', bar.querySelector('select')?.closest('label') ?? null],
      ['variant switch', bar.querySelector('.sj-variant-select')],
      ['zoom', screen.getByRole('button', { name: 'Zoom out' }).parentElement],
      ['capacity readout', screen.getByText(/Template size/).closest('div')],
    ];
    for (const [name, control] of groups) {
      expect(control, `${name} is on the bar`).not.toBeNull();
      const child = children.find((candidate) => candidate.contains(control));
      expect(child, `${name} sits directly on the bar`).toBeTruthy();
      expect(
        child?.previousElementSibling?.classList.contains('w-px'),
        `the rule before the ${name}`,
      ).toBe(true);
    }
  });

  it('never places two rules side by side, selection or none', () => {
    // The property the leading-rule convention exists for, and a NEGATIVE
    // universal — so it is swept over the population, not over the one state
    // the view cluster happens to render in. WITH a selection the format
    // cluster mounts (and, inside it, the style, typography and align rules);
    // without one it renders nothing at all, which is the case where the view
    // cluster's own last group has to not leave a trailing rule behind.
    const bare = draw(makeTransport(), {
      sampleSet: TWO,
      imageCodec: fakeCodec(),
      source: WITH_IMAGE,
    });
    const noAdjacentRules = () => {
      const found = [...document.querySelectorAll<HTMLElement>('[role="toolbar"] span.w-px')];
      expect(found.length).toBeGreaterThan(0);
      for (const rule of found) {
        expect(rule.nextElementSibling?.classList.contains('w-px')).not.toBe(true);
        expect(rule.previousElementSibling?.classList.contains('w-px')).not.toBe(true);
      }
      return found.length;
    };
    noAdjacentRules();
    bare.unmount();

    // Selecting the text item brings the format cluster — and its own three
    // rules — onto the same rail. The positive control is that it really did
    // mount: without it this second sweep would re-prove the first.
    draw(makeTransport(), { sampleSet: TWO });
    fireEvent.click(screen.getByRole('button', { name: 'hello' }));
    expect(document.querySelector('.sj-format-toolbar-body')).not.toBeNull();
    noAdjacentRules();
  });

  it('brings its rule with the variant switch, and takes it away again', () => {
    // Unmounted between the two mounts: the count is only meaningful against
    // ONE toolbar in the document.
    const single = draw(makeTransport());
    const withoutSwitch = rules().length;
    expect(document.querySelector('.sj-variant-select')).toBeNull();
    single.unmount();

    draw(makeTransport(), { sampleSet: TWO });
    expect(document.querySelectorAll('.sj-variant-select')).toHaveLength(1);
    expect(rules().length).toBe(withoutSwitch + 1);
  });

  it('brings its rule with the capacity readout, and takes it away again', () => {
    // The readout needs BOTH an image item in the document and a host codec, so
    // there are TWO off arms and they are asserted separately: one `&&` produces
    // the same `null` from either, which is exactly why branch coverage cannot
    // tell you the second one was checked.
    const noCodec = draw(makeTransport(), { source: WITH_IMAGE });
    const withoutReadout = rules().length;
    noCodec.unmount();

    // Off arm 2: the codec is present, the document has no image item.
    const noImageItem = draw(makeTransport(), { imageCodec: fakeCodec() });
    expect(rules().length).toBe(withoutReadout);
    noImageItem.unmount();

    draw(makeTransport(), { source: WITH_IMAGE, imageCodec: fakeCodec() });
    expect(rules().length).toBe(withoutReadout + 1);
  });
});
