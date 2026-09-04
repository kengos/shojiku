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

  it('offers the two form marks only when the engine advertises them', () => {
    // Same threading claim as the rule above — and the checkbox's gate is TWO
    // keys, because its snippet authors no `box:`: against an engine that has
    // `checkbox` but not the cap-height default, an unsized mark is skipped
    // with `mark_missing_size` rather than drawn.
    draw(makeTransport(), { capabilities: ['ellipse', 'checkbox', 'checkbox.auto_size'] });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('menuitem', { name: 'Ellipse' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Checkbox' })).toBeDefined();

    draw(makeTransport(), { capabilities: ['ellipse', 'checkbox'] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[1]);
    expect(screen.getAllByRole('menuitem', { name: 'Ellipse' })).toHaveLength(1);
    expect(screen.queryAllByRole('menuitem', { name: 'Checkbox' })).toHaveLength(0);

    draw(makeTransport(), { capabilities: ['checkbox', 'checkbox.auto_size'] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[2]);
    expect(screen.queryAllByRole('menuitem', { name: 'Ellipse' })).toHaveLength(0);
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

describe('the character grid and the page break', () => {
  // A real flow body — `sections.body` REQUIRES `type:` on the wire (a body
  // without one does not parse: "missing field `type`"), so the shared
  // `SOURCE` fixture, which omits it, is not a document any engine could
  // render and cannot answer a flow-vs-not question.
  const FLOW = [
    'version: 0.1.0',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: hello',
    '',
  ].join('\n');

  const BAND = [
    'version: 0.1.0',
    'sections:',
    '  body:',
    '    type: flow',
    '    items: []',
    '  footer:',
    '    repeat: every_page',
    '    height: 40',
    '    items: []',
    '',
  ].join('\n');

  const ABSOLUTE = [
    'version: 0.1.0',
    'sections:',
    '  body:',
    '    type: absolute',
    '    items:',
    '      - type: text',
    '        text: hello',
    '        box: { x: 0, y: 0, w: 100, h: 20 }',
    '',
  ].join('\n');

  it('offers each row only when the engine advertises its item type', () => {
    // Same THREADING claim the rule and the marks above pin: a capability key
    // typed wrong in ONE of the two places leaves `insertMenuGroups` correct
    // and the row permanently absent, with every model test still green. It
    // does not catch the same typo made in both, since the literal here is the
    // literal there — the spellings themselves are pinned by the engine's
    // capability list, not by this.
    draw(makeTransport(), { source: FLOW, capabilities: ['char_grid', 'page_break'] });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('menuitem', { name: 'Character grid' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Page break' })).toBeDefined();

    draw(makeTransport(), { source: FLOW, capabilities: ['text'] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert' })[1]);
    expect(screen.queryAllByRole('menuitem', { name: 'Character grid' })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: 'Page break' })).toHaveLength(0);
  });

  it('offers both rows against an engine that reports no capabilities at all', () => {
    // `capabilities === undefined` is the unknown-engine convention every other
    // gate follows: arm the row rather than withhold a legal insert.
    draw(makeTransport(), { source: FLOW, capabilities: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.getByRole('menuitem', { name: 'Character grid' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Page break' })).toBeDefined();
  });

  it('writes a grid sized from the page, with content so it draws no diagnostic', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: FLOW, onChange });
    pickMenu('Insert', 'Character grid');
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('type: char_grid');
    expect(written).toMatch(/char_grid[\s\S]*charsPerLine: 20/);
    expect(written).toMatch(/char_grid[\s\S]*lines: 10/);
    // Content, not just dimensions: with neither `text` nor `data` the engine
    // reports `empty_char_grid_item`, so the row would insert a diagnostic.
    expect(written).toMatch(/type: char_grid\n\s+text:/);
  });

  it('writes a page break as the bare tag, with no box beside it', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: FLOW, onChange });
    pickMenu('Insert', 'Page break');
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('- type: page_break');
    // A `box:` here is a parse error, not a misplacement.
    expect(written).not.toMatch(/type: page_break\n\s+box:/);
  });

  it('refuses the page break in a band, naming the reason', () => {
    // The mirror of the page-number refusal at the top of this file, through
    // the same real menu.
    draw(makeTransport(), { source: BAND });
    pickMenu('Insert', 'Footer');
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const row = screen.getByRole('menuitem', { name: /Page break/ });
    expect(row.textContent).toContain('only the body can hold one');
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('refuses the page break in an ABSOLUTE body, which is not a band at all', () => {
    // The case `bandTarget` could never have answered, and not a hypothetical:
    // three bundled PRESETS ship an absolute body (both certificates and the
    // rirekisho). The engine warns `page_break_in_absolute_body` and skips.
    draw(makeTransport(), { source: ABSOLUTE });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const row = screen.getByRole('menuitem', { name: /Page break/ });
    expect(row.textContent).toContain('only the body can hold one');
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the character grid armed in both of those places', () => {
    // It carries no placement gate: the engine lays a `char_grid` out
    // everywhere, drawing one sheet outside a flow body rather than skipping
    // it, so withholding the row there would refuse a legal insert.
    for (const source of [BAND, ABSOLUTE]) {
      draw(makeTransport(), { source });
      fireEvent.click(screen.getAllByRole('button', { name: 'Insert' }).at(-1) as HTMLElement);
      expect(
        screen
          .getAllByRole('menuitem', { name: /Character grid/ })
          .at(-1)
          ?.getAttribute('aria-disabled'),
      ).not.toBe('true');
    }
  });
});
