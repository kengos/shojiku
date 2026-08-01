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
    expect(row.textContent).toContain('Only inside a header or footer band');
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

  it('keeps a body insert box-less, so the flow auto-sizes it', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: BAND_SOURCE, onChange });
    pickMenu('Insert', 'Text');
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('- type: text');
    expect(written).not.toMatch(/type: text\n\s+box:/);
  });
});
