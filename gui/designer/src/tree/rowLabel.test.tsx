// How a tree row PRESENTS a label that does not fit (tree/TreeRow.tsx).
//
// A bound row's label is the item's own text with its binding inline
// (`納品番号 {delivery.number}`), and on one nowrap line the pane's 240px
// default clipped the binding off EVERY such row on the delivery-note preset —
// the part that says which field the row is showing. It wraps to at most three
// lines instead, the shape the data-item list and the band placeholder use.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { LayerTree } from './LayerTree';
import { buildTree } from './model';
import { MAX_LABEL_CHARS } from './nodeFields';

function drawTemplate(text: string) {
  return render(
    <I18nProvider locale="en">
      <LayerTree
        view={buildTree(['sections:', '  body:', '    items:', ...text.split('\n')].join('\n'))}
        selection={null}
        onSelect={vi.fn()}
        applyAll={vi.fn(() => ({ ok: true }) as const)}
        read={vi.fn()}
        onOpenDocument={vi.fn()}
      />
    </I18nProvider>,
  );
}

/** The label span inside a row — the element the wrap treatment sits on. */
function labelSpan(name: string): HTMLElement {
  const found = screen
    .getByRole('button', { name })
    .querySelector<HTMLElement>('span:not([aria-hidden])');
  if (found === null) {
    throw new Error(`no label span in the row ${name}`);
  }
  return found;
}

describe('a tree row label that does not fit', () => {
  const BOUND = '納品番号 {delivery.number}';

  it('renders the binding in full rather than clipping it', () => {
    drawTemplate(`      - type: text\n        text: '${BOUND}'`);
    // The COMPONENT clips nothing: the whole label, binding included, is in the
    // accessible name and in the text.
    expect(labelSpan(BOUND).textContent).toBe(BOUND);
  });

  it('wraps instead of truncating on one line', () => {
    drawTemplate(`      - type: text\n        text: '${BOUND}'`);
    const span = labelSpan(BOUND);
    expect(span.className).toContain('line-clamp-3');
    // `anywhere`, because a binding key carries no break opportunity of its own.
    expect(span.className).toContain('[overflow-wrap:anywhere]');
    // The treatment this replaced. jsdom computes no layout, so the class list
    // is the only thing that can say which of the two shipped.
    expect(span.className).not.toContain('whitespace-nowrap');
    expect(span.className).not.toContain('text-ellipsis');
  });

  it('keeps the type mark on the first line whatever the label costs', () => {
    // The row's parts are TOP-aligned, and the mark sits in a box the height of
    // one line. Centring them against the whole block instead puts the mark
    // beside the SECOND line of a three-line row while a two-line row keeps it
    // up top, so the marks stop lining up down the tree — a review of the
    // running app caught exactly that, and this pins the fix (jsdom computes no
    // layout, so the treatment is what a test can hold).
    drawTemplate(`      - type: text\n        text: '${BOUND}'`);
    const button = screen.getByRole('button', { name: BOUND });
    // The whole ROW, not just the label button: the twisty is the button's
    // SIBLING, so top-aligning the button alone left the chevron centred
    // against the block and drifting down as the label grew — measured at
    // 23.2px against its neighbours' 11.6px on a two-line row.
    const row = button.parentElement;
    expect(row?.className).toContain('items-start');
    expect(row?.className).not.toContain('items-center');
    expect(button.className).toContain('items-start');
    // Both fixed-width gutters are one line box high, so each sits on line 1.
    const mark = button.querySelector('[aria-hidden="true"]');
    expect(mark?.className).toContain('h-5');
    expect(mark?.className).toContain('items-center');
    expect(row?.querySelector('[aria-expanded], [aria-hidden="true"]')?.className).toContain('h-5');
  });

  it('stays clamped for an UNKNOWN item type, which nothing clips', () => {
    // The real worst case, and the one the bounded arm below hides:
    // `labels.ts`'s `kindName` returns an unrecognised wire spelling VERBATIM
    // (deliberately — a newer engine's item type must not be mislabelled), so
    // this label never passes through `MAX_LABEL_CHARS` at all. The clamp is
    // the only thing bounding the row's height here.
    const runOn = 'z'.repeat(MAX_LABEL_CHARS * 20);
    drawTemplate(`      - type: ${runOn}`);
    const span = labelSpan(runOn);
    expect(span.textContent).toBe(runOn);
    expect(span.className).toContain('line-clamp-3');
  });

  it('stays clamped for a label with no break opportunity at all', () => {
    // The bounded arm: a content-derived label IS clipped at
    // `MAX_LABEL_CHARS`, but a single unbroken run at the cap would still
    // stack as many lines as the pane is narrow. `line-clamp-3` holds it.
    const runOn = 'A'.repeat(MAX_LABEL_CHARS);
    drawTemplate(`      - type: text\n        text: '${runOn}'`);
    const span = labelSpan(runOn);
    expect(span.textContent).toBe(runOn);
    expect(span.className).toContain('line-clamp-3');
  });
});
