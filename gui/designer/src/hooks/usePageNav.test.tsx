// Designer-level tests for hooks/usePageNav.ts — the page-nav rail
// (most-visible page tracking, thumbnail jump).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RenderOutcome } from '../engine/transport';
import { BOX } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

/** A render outcome carrying `count` pages (each 100×100), for the page-nav
 * rail. Boxes only for page 0 — the rail reads pages, not boxes. */
function outcomePages(count: number): RenderOutcome {
  const pages = Array.from({ length: count }, () => ({
    width: 100,
    height: 100,
    rgba: new Uint8Array(100 * 100 * 4),
  }));
  return {
    ok: true,
    pages,
    inspect: {
      engine: { version: '0', capabilities: [], builtinLocales: [] },
      document: {},
      boxes: { pages: [[{ path: 'sections.body.items[0]', border: BOX, content: BOX }]] },
      margin: [0, 0, 0, 0],
    },
    diagnostics: { items: [] },
  };
}

/** Assign a fixed client rect to `el` (jsdom returns all-zeros otherwise). */
function stubRect(el: Element, top: number, bottom: number) {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top }) as DOMRect;
}

describe('Designer — page-nav rail', () => {
  it('shows no rail for a single-page document', async () => {
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomePages(1)) });
    draw(transport);
    await waitFor(() => expect(transport.renderRaw).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: 'Page thumbnails' })).toBeNull();
  });

  it('shows a thumbnail per page for a multi-page document', async () => {
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomePages(3)) });
    draw(transport);
    const rail = await screen.findByRole('navigation', { name: 'Page thumbnails' });
    expect(within(rail).getByLabelText('Page 1')).toBeDefined();
    expect(within(rail).getByLabelText('Page 3')).toBeDefined();
    // The first page is current until the user scrolls.
    expect(within(rail).getByLabelText('Page 1').getAttribute('aria-current')).toBe('true');
  });

  it('jumps to a page when its thumbnail is clicked', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const transport = makeTransport({ renderRaw: vi.fn(async () => outcomePages(3)) });
      draw(transport);
      const rail = await screen.findByRole('navigation', { name: 'Page thumbnails' });
      fireEvent.click(within(rail).getByLabelText('Page 3'));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    } finally {
      (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = undefined;
    }
  });

  it('does not throw jumping when scrollIntoView is unavailable (jsdom)', async () => {
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomePages(2)) });
    const { container } = draw(transport);
    const rail = await screen.findByRole('navigation', { name: 'Page thumbnails' });
    expect(() => fireEvent.click(within(rail).getByLabelText('Page 2'))).not.toThrow();
    expect(container).toBeDefined();
  });

  it('highlights the most-visible page as the canvas scrolls', async () => {
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomePages(3)) });
    const { container } = draw(transport);
    const rail = await screen.findByRole('navigation', { name: 'Page thumbnails' });
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    const wrappers = container.querySelectorAll('.sj-canvas > div');
    // Viewport [0,100]; page 1 fills it, pages 0/2 sit off-screen.
    stubRect(scroll, 0, 100);
    stubRect(wrappers[0], -110, -10);
    stubRect(wrappers[1], 0, 100);
    stubRect(wrappers[2], 110, 210);
    fireEvent.scroll(scroll);
    await waitFor(() =>
      expect(within(rail).getByLabelText('Page 2').getAttribute('aria-current')).toBe('true'),
    );
    expect(within(rail).getByLabelText('Page 1').getAttribute('aria-current')).toBeNull();
  });
});
