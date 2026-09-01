// Designer-level tests for hooks/useInsertActions.ts — plain element inserts,
// page numbers and band-aware placement through the insert menu.
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draw, makeTransport, pickMenu } from '../testkit/harness';

describe('page numbers and band inserts', () => {
  const BAND_SOURCE = [
    'version: 0.1.0',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: hello',
    '  footer:',
    '    repeat: every_page',
    '    items: []',
    '',
  ].join('\n');

  it('refuses a page number outside a band, naming the reason', () => {
    draw(makeTransport());
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const row = screen.getByRole('menuitem', { name: /Page number/ });
    // The reason now reads as a STEP, not a wall: the two rows that satisfy
    // it sit directly below, under the divider.
    expect(row.textContent).toContain('available once you add a header or footer');
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('inserts into the selected band, with the coordinates a band needs', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: BAND_SOURCE, onChange });
    fireEvent.click(await screen.findByRole('button', { name: /Footer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Page number' }));
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('type: page_number');
    // Band children are coordinate-placed; the body insert below is not.
    expect(written).toMatch(/page_number[\s\S]*x: 0[\s\S]*y: \d+/);
  });

  it('offers the plain rule only when the engine advertises the Length endpoint', () => {
    // The gate lives in this hook, not in `insertMenuGroups` — a mistyped
    // capability key would leave the model correct and the row permanently
    // absent, with every `insertMenu` test still green. On/off through the
    // real prop is what pins the THREADING.
    draw(makeTransport(), { capabilities: ['line', 'line.length'] });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('menuitem', { name: 'Line' })).toBeDefined();

    draw(makeTransport(), { capabilities: ['line'] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[1]);
    expect(screen.queryAllByRole('menuitem', { name: 'Line' })).toHaveLength(0);
  });

  it('places a rule in a band through its ENDPOINTS, authoring no box', () => {
    // The end-to-end form of the parse-error class: `LineItem` has no `box`
    // field, so the coordinates a band needs have to reach `from`/`to`.
    const onChange = vi.fn();
    draw(makeTransport(), { source: BAND_SOURCE, onChange });
    fireEvent.click(screen.getByRole('button', { name: /Footer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Line' }));
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('type: line');
    expect(written).not.toContain('box:');
    // BOTH endpoints carry the same y, and it is the band offset plus the
    // snippet's own 4pt — i.e. the offset reached the coordinates rather than
    // being dropped. The footer offset is read off the document's own A4
    // margin box (791pt floored, less the 32pt inset), with no render in the
    // harness at all.
    const ys = [...written.matchAll(/y: (\d+)/g)].map((m) => Number(m[1]));
    expect(ys).toEqual([763, 763]);
  });

  const BODY_ONLY = [
    'version: 0.1.0',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: hello',
    '',
  ].join('\n');

  it('creates a missing band from the insert menu, then unblocks the page number', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: BODY_ONLY, onChange });
    // The row is a bare noun and never disabled — it is the SAME row whether
    // or not the band exists.
    pickMenu('Insert', 'Footer');
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('footer:');
    expect(written).toMatch(/footer:[\s\S]*repeat: every_page/);
    expect(written).toMatch(/footer:[\s\S]*height: 40/);
    // The band is selected, so the page-number row is now armed.
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const row = screen.getByRole('menuitem', { name: /Page number/ });
    expect(row.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('selects an existing band from the menu without authoring anything', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: BAND_SOURCE, onChange });
    const before = onChange.mock.calls.length;
    pickMenu('Insert', 'Footer');
    expect(onChange.mock.calls.length).toBe(before);
    // Selecting it is what the row does — the page-number row is armed.
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(
      screen.getByRole('menuitem', { name: /Page number/ }).getAttribute('aria-disabled'),
    ).not.toBe('true');
  });

  it('keeps a body insert box-less, so the flow auto-sizes it', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: BAND_SOURCE, onChange });
    pickMenu('Insert', 'Text');
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('- type: text');
    expect(written).not.toMatch(/type: text\n\s+box:/);
  });
});
