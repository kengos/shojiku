// The empty property panel: it must ORIENT (say what the document is and what
// to do next) and it must DECLINE rather than guess — a reassuring surface that
// invents a page size is worse than one that says nothing.

import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { documentGlance, NoSelectionCard } from './NoSelectionCard';

function makeController(page: unknown, overrides: Partial<EditorController> = {}) {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === 'page' ? page : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
    ...overrides,
  } as EditorController;
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

describe('documentGlance', () => {
  it('names an absent page as the engine defaults: A4 portrait, 25pt margins', () => {
    expect(documentGlance(makeController(undefined).read)).toEqual({
      page: 'A4 — 210 × 297 mm',
      margin: '25 pt',
    });
  });

  it('reports a custom size and a per-side margin in CSS order', () => {
    const glance = documentGlance(
      makeController({
        size: { w: '100mm', h: '150mm' },
        margin: { top: 5, right: '10mm', bottom: 5, left: '10mm' },
      }).read,
    );
    expect(glance.page).toBe('100 × 150 mm');
    expect(glance.margin).toBe('5 / 10mm / 5 / 10mm');
  });

  it('reads an ARRAY margin as its four sides', () => {
    expect(documentGlance(makeController({ margin: [1, 2, 3, 4] }).read).margin).toBe(
      '1 / 2 / 3 / 4',
    );
  });

  it('declines a page it cannot describe rather than naming one', () => {
    // An unrecognized size spelling: `pageSummary` returns null and the row
    // disappears — the margin, which is a separate key, still reports.
    const glance = documentGlance(makeController({ size: 'B7-ish' }).read);
    expect(glance.page).toBeNull();
    expect(glance.margin).toBe('25 pt');
  });

  it('declines a margin whose single value would be an invention', () => {
    // A string scalar is an engine parse error, and `readMarginView` normalises
    // it to the 25pt default — so reporting that number would state a value the
    // document does not hold. A non-finite number is the same case.
    expect(documentGlance(makeController({ margin: '12mm' }).read).margin).toBeNull();
    expect(documentGlance(makeController({ margin: Number.NaN }).read).margin).toBeNull();
  });

  it('degrades to nothing-to-say when the read THROWS', () => {
    const controller = makeController(undefined, {
      read: () => {
        throw new Error('hostile document');
      },
    });
    expect(documentGlance(controller.read)).toEqual({ page: null, margin: null });
  });

  it('clips an over-long side value instead of stretching the panel', () => {
    const long = 'x'.repeat(400);
    const margin = documentGlance(makeController({ margin: { top: long } }).read).margin ?? '';
    expect(margin.length).toBeLessThan(70);
    expect(margin.endsWith('…')).toBe(true);
  });

  it('renders a hostile side value as TEXT, never as markup', () => {
    const evil = '<img src=x onerror="alert(1)">';
    draw(<NoSelectionCard controller={makeController({ margin: { top: evil } })} />);
    expect(screen.getByText(/<img src=x/)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('survives a hostile page node where a map belongs', () => {
    expect(() => draw(<NoSelectionCard controller={makeController([1, 2, 3])} />)).not.toThrow();
  });
});

describe('NoSelectionCard', () => {
  it('says what the document is and what to do next', () => {
    draw(<NoSelectionCard controller={makeController(undefined)} onOpenDocument={vi.fn()} />);
    expect(screen.getByText(/Pick an item on the canvas/)).toBeTruthy();
    expect(screen.getByText('Page')).toBeTruthy();
    expect(screen.getByText('A4 — 210 × 297 mm')).toBeTruthy();
    expect(screen.getByText('Margins')).toBeTruthy();
    expect(screen.getByText('25 pt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open document settings' })).toBeTruthy();
  });

  it('drops the CTA when the host passes no opener, and still states the document', () => {
    draw(<NoSelectionCard controller={makeController(undefined)} />);
    expect(screen.queryByRole('button', { name: 'Open document settings' })).toBeNull();
    expect(screen.getByText('Page')).toBeTruthy();
  });

  it('drops the whole card when neither fact can be stated', () => {
    const controller = makeController(undefined, {
      read: () => {
        throw new Error('hostile document');
      },
    });
    draw(<NoSelectionCard controller={controller} />);
    expect(screen.queryByText('Page')).toBeNull();
    expect(screen.queryByText('Margins')).toBeNull();
    // The sentence that says what to do next is unconditional.
    expect(screen.getByText(/Pick an item on the canvas/)).toBeTruthy();
  });

  it('shows the margin row alone when the page cannot be described', () => {
    draw(<NoSelectionCard controller={makeController({ size: 'B7-ish' })} />);
    expect(screen.queryByText('Page')).toBeNull();
    expect(screen.getByText('Margins')).toBeTruthy();
  });

  it('shows the page row alone when the margin cannot be stated honestly', () => {
    // The mirror case: a string `margin` is an engine parse error that the
    // margin reader normalises to its 25pt default, so the row is withheld —
    // while the page, a separate key, is perfectly readable.
    draw(<NoSelectionCard controller={makeController({ size: 'A4', margin: '12mm' })} />);
    expect(screen.getByText('Page')).toBeTruthy();
    expect(screen.queryByText('Margins')).toBeNull();
  });
});
