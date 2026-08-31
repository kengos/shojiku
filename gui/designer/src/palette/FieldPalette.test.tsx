import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { FieldPalette } from './FieldPalette';

const DEFINITIONS = [
  'type: object',
  'properties:',
  '  receipt:',
  '    type: object',
  '    title: Receipt',
  '    description: Header fields.',
  '    properties:',
  '      number:',
  '        type: string',
  '        title: Number',
  '        description: The issued receipt number.',
  '        example: "R-001"',
  '      note:',
  '        type: mystery_type',
  '  items:',
  '    type: array',
  '    title: Line items',
  '    items:',
  '      type: object',
  '      properties:',
  '        name:',
  '          type: string',
  '          title: Item name',
  '',
].join('\n');

const TEMPLATE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        data: { key: receipt.number }',
  '      - type: text',
  '        data: { key: receipt.number }',
  '      - type: table',
  '        data: { key: items }',
  '        columns:',
  '          - label: name',
  '            data: { key: name }',
  '',
].join('\n');

function draw(over: Partial<Parameters<typeof FieldPalette>[0]> = {}, locale = 'en') {
  const onSelect = vi.fn();
  const utils = render(
    <I18nProvider locale={locale}>
      <FieldPalette
        definitions={DEFINITIONS}
        templateText={TEMPLATE}
        onSelect={onSelect}
        {...over}
      />
    </I18nProvider>,
  );
  return { onSelect, ...utils };
}

describe('FieldPalette', () => {
  it('renders the data-editor gear only when onOpenEditor is supplied', () => {
    const { rerender } = draw();
    expect(screen.queryByRole('button', { name: 'Edit data fields' })).toBeNull();
    const onOpenEditor = vi.fn();
    rerender(
      <I18nProvider locale="en">
        <FieldPalette
          definitions={DEFINITIONS}
          templateText={TEMPLATE}
          onSelect={vi.fn()}
          onOpenEditor={onOpenEditor}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit data fields' }));
    expect(onOpenEditor).toHaveBeenCalledOnce();
  });

  it('renders groups and fields with label, key, type, sample, usage', () => {
    draw();
    expect(screen.getByText('Receipt')).toBeDefined();
    // The GROUP description stays inline — one per group, not one per row.
    expect(screen.getByText('Header fields.')).toBeDefined();
    expect(screen.getByText('Number')).toBeDefined();
    expect(screen.getByText('receipt.number')).toBeDefined();
    // Both `string` fields display the localized type label.
    expect(screen.getAllByText('Text').length).toBe(2);
    expect(screen.getByText('R-001')).toBeDefined();
    expect(screen.getByText('Used ×2')).toBeDefined();
    // The unbound field reads unused; an unknown type displays verbatim.
    expect(screen.getByText('Unused')).toBeDefined();
    expect(screen.getByText('mystery_type')).toBeDefined();
  });

  it("folds a FIELD's description into a `?`, closed until asked", () => {
    draw();
    // Inline it cost ~5 lines of a ~215px row on a real shipped example and
    // pushed the usage badge out of view; the data-item editor's own field row
    // (`data/ItemListRow.tsx`) already folds the same value this way.
    expect(screen.queryByText('The issued receipt number.')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Description' })[0]);
    expect(screen.getByText('The issued receipt number.')).toBeDefined();
  });

  it('gives a field with no description no `?` at all', () => {
    draw();
    // One `?` for the one described field — an empty description must not
    // leave a dead affordance on every other row.
    expect(screen.getAllByRole('button', { name: 'Description' }).length).toBe(1);
  });

  it('marks the array group as repeating', () => {
    draw();
    expect(screen.getByText('Repeating')).toBeDefined();
  });

  it('selects a bound path on click and cycles through placements', () => {
    const { onSelect } = draw();
    const field = screen.getByRole('button', { name: /Number/ });
    fireEvent.click(field);
    expect(onSelect).toHaveBeenLastCalledWith('sections.body.items[0]');
    fireEvent.click(field);
    expect(onSelect).toHaveBeenLastCalledWith('sections.body.items[1]');
    // Wraps back to the first placement.
    fireEvent.click(field);
    expect(onSelect).toHaveBeenLastCalledWith('sections.body.items[0]');
  });

  it('restarts the cycle when a different field is clicked', () => {
    const { onSelect } = draw();
    fireEvent.click(screen.getByRole('button', { name: /Number/ }));
    fireEvent.click(screen.getByRole('button', { name: /Item name/ }));
    expect(onSelect).toHaveBeenLastCalledWith('sections.body.items[2].columns[0]');
    fireEvent.click(screen.getByRole('button', { name: /Number/ }));
    expect(onSelect).toHaveBeenLastCalledWith('sections.body.items[0]');
  });

  it('selects the array source from the group heading', () => {
    const { onSelect } = draw();
    fireEvent.click(screen.getByRole('button', { name: /Line items/ }));
    expect(onSelect).toHaveBeenLastCalledWith('sections.body.items[2]');
  });

  it('leaves an unused field and an unbound array group inert', () => {
    const { onSelect } = draw({
      templateText: 'version: "1"',
    });
    // No bindings at all: no field is a button, the group heading is static.
    expect(screen.queryByRole('button', { name: /Number/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Line items/ })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('filters fields by the search query and reports no matches', () => {
    draw();
    const search = screen.getByLabelText('Search fields');
    fireEvent.change(search, { target: { value: 'item name' } });
    expect(screen.queryByText('Number')).toBeNull();
    expect(screen.getByText('Item name')).toBeDefined();
    fireEvent.change(search, { target: { value: 'zzz-none' } });
    expect(screen.getByText('No fields match.')).toBeDefined();
  });

  it('shows the empty state for unparseable definitions', () => {
    draw({ definitions: 'properties: [' });
    expect(screen.getByText('No data fields.')).toBeDefined();
  });

  it('shows the empty state for definitions without properties (incl. v1)', () => {
    draw({ definitions: 'version: "1"' });
    expect(screen.getByText('No data fields.')).toBeDefined();
  });

  it('shows the localized ungrouped heading for top-level scalar fields', () => {
    draw({
      definitions: ['type: object', 'properties:', '  purpose:', '    type: string', ''].join('\n'),
    });
    expect(screen.getByText('General fields')).toBeDefined();
    // The label falls back to the key, so both spans carry `purpose`.
    expect(screen.getAllByText('purpose').length).toBe(2);
  });

  it('renders hostile markup in definitions content as inert text', () => {
    const { container } = draw({
      definitions: [
        'type: object',
        'properties:',
        '  attack:',
        '    type: object',
        '    title: <img src=x onerror=alert(1)>',
        '    properties:',
        '      k:',
        '        type: string',
        '        title: <script>alert(2)</script>',
        '        example: "<b>bold</b>"',
        '',
      ].join('\n'),
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeDefined();
    expect(screen.getByText('<script>alert(2)</script>')).toBeDefined();
    expect(screen.getByText('<b>bold</b>')).toBeDefined();
  });

  it('renders localized chrome', () => {
    draw({}, 'ja-JP');
    expect(screen.getByText('データ項目')).toBeDefined();
    expect(screen.getByText('2箇所で使用')).toBeDefined();
    expect(screen.getByText('繰り返し')).toBeDefined();
  });
});

describe('FieldPalette — drag-to-bind wiring', () => {
  function makeDrag(consume = false) {
    return {
      begin: vi.fn(),
      move: vi.fn(),
      up: vi.fn(),
      cancel: vi.fn(),
      consumeClick: vi.fn(() => consume),
    };
  }

  it('arms a drag with the field payload on pointer press (used and unused rows)', () => {
    const drag = makeDrag();
    draw({ drag });
    // An unused document-scope field (a div row) is draggable — binding
    // something unused is the primary flow.
    const unused = screen.getByText('note').closest('.sj-palette-field');
    expect(unused).not.toBeNull();
    if (unused !== null) {
      fireEvent.pointerDown(unused, { pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 });
    }
    expect(drag.begin).toHaveBeenCalledTimes(1);
    expect(drag.begin.mock.calls[0][0]).toEqual({
      kind: 'field',
      field: { key: 'receipt.note', type: 'mystery_type', label: 'note', group: null },
    });
    // A used field (a button row) is draggable too.
    const used = screen.getByRole('button', { name: /Number/ });
    fireEvent.pointerDown(used, { pointerId: 2, isPrimary: true, clientX: 5, clientY: 5 });
    expect(drag.begin).toHaveBeenCalledTimes(2);
    expect(drag.begin.mock.calls[1][0]).toEqual({
      kind: 'field',
      field: { key: 'receipt.number', type: 'string', label: 'Number', group: null },
    });
  });

  it('names the parent group on a row-carried source, falling back to its id', () => {
    // Two sources can legitimately share a title — one per order, one for the
    // document — and they are bound in different scopes, so the heading has
    // to say which is which.
    const definitions = [
      'type: object',
      'properties:',
      '  orders:',
      '    type: array',
      '    title: Orders',
      '    items:',
      '      type: object',
      '      properties:',
      '        items:',
      '          type: array',
      '          title: Contents',
      '          items:',
      '            type: object',
      '            properties:',
      '              title:',
      '                type: string',
      '',
    ].join('\n');
    draw({ definitions, templateText: 'sections:\n  body:\n    type: flow\n    items: []\n' });
    expect(screen.getByText('Inside Orders')).toBeDefined();

    // A parent with no title of its own: the heading falls back to the id it
    // is addressed by, never to nothing.
    const untitled = definitions.replace('    title: Orders\n', '');
    draw({
      definitions: untitled,
      templateText: 'sections:\n  body:\n    type: flow\n    items: []\n',
    });
    expect(screen.getAllByText('Inside orders').length).toBeGreaterThan(0);
  });

  it('never arms a drag for an array carried by another array’s rows', () => {
    // `orders.items` is bindable only from inside an `orders` cell, with a
    // row-relative key: dragging its heading would author a document-scope
    // scaffold whose source path resolves to nothing, and its rows have no
    // cell to be dropped into. Both stay display-only — while the
    // document-scope array group beside it keeps its drag.
    const drag = makeDrag();
    const definitions = [
      'type: object',
      'properties:',
      '  orders:',
      '    type: array',
      '    title: Orders',
      '    items:',
      '      type: object',
      '      properties:',
      '        name:',
      '          type: string',
      '          title: Recipient',
      '        items:',
      '          type: array',
      '          title: Contents',
      '          items:',
      '            type: object',
      '            properties:',
      '              title:',
      '                type: string',
      '                title: Product',
      '',
    ].join('\n');
    draw({
      definitions,
      templateText: 'sections:\n  body:\n    type: flow\n    items: []\n',
      drag,
    });

    const nestedHeading = screen.getByText('Contents');
    fireEvent.pointerDown(nestedHeading, { pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 });
    const nestedField = screen.getByText('Product').closest('.sj-palette-field');
    expect(nestedField).not.toBeNull();
    if (nestedField !== null) {
      fireEvent.pointerDown(nestedField, { pointerId: 2, isPrimary: true, clientX: 5, clientY: 5 });
    }
    expect(drag.begin).not.toHaveBeenCalled();

    // The control: the parent group is document-scope and still drags.
    fireEvent.pointerDown(screen.getByText('Orders'), {
      pointerId: 3,
      isPrimary: true,
      clientX: 5,
      clientY: 5,
    });
    expect(drag.begin).toHaveBeenCalledTimes(1);
  });

  it('arms an array-group field with its GROUP id, so the planner can place it', () => {
    // A row-relative key resolves only inside a cell fed by that same group;
    // carrying the id is what lets the drop planner tell those cells apart
    // from the body, where the key would mean nothing.
    const drag = makeDrag();
    draw({ drag });
    const rowField = screen.getByRole('button', { name: /Item name/ });
    fireEvent.pointerDown(rowField, { pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 });
    expect(drag.begin).toHaveBeenCalledTimes(1);
    expect(drag.begin.mock.calls[0][0]).toEqual({
      kind: 'field',
      field: { key: 'name', type: 'string', label: 'Item name', group: 'items' },
    });
  });

  it('arms an array-group drag from its heading with the group payload', () => {
    const drag = makeDrag();
    draw({ drag });
    const heading = screen.getByText('Line items').closest('h3');
    expect(heading).not.toBeNull();
    if (heading !== null) {
      fireEvent.pointerDown(heading, { pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 });
    }
    expect(drag.begin).toHaveBeenCalledTimes(1);
    const payload = drag.begin.mock.calls[0][0] as { kind: string; group: { id: string } };
    expect(payload.kind).toBe('group');
    expect(payload.group.id).toBe('items');
  });

  it('keeps a scalar group heading drag-inert', () => {
    const drag = makeDrag();
    draw({ drag });
    const heading = screen.getByText('Receipt').closest('h3');
    expect(heading).not.toBeNull();
    if (heading !== null) {
      fireEvent.pointerDown(heading, { pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 });
    }
    expect(drag.begin).not.toHaveBeenCalled();
  });

  it('suppresses the trailing click of a completed group drag (no source cycle)', () => {
    const drag = makeDrag(true);
    const { onSelect } = draw({ drag });
    // The bound array group's heading is a button; a completed drag's
    // trailing click must not also cycle to the source placement.
    fireEvent.click(screen.getByRole('button', { name: /Line items/ }));
    expect(drag.consumeClick).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('suppresses the trailing click of a completed drag (no placement cycle)', () => {
    const drag = makeDrag(true);
    const { onSelect } = draw({ drag });
    fireEvent.click(screen.getByRole('button', { name: /Number/ }));
    expect(drag.consumeClick).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('suppresses the trailing click on an ARRAY-GROUP field row too', () => {
    // Newly draggable rows ride the same guard: a completed drag must not
    // also cycle to the row field's placement.
    const drag = makeDrag(true);
    const { onSelect } = draw({ drag });
    fireEvent.click(screen.getByRole('button', { name: /Item name/ }));
    expect(drag.consumeClick).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still picks/cycles on a plain click when the drag did not start', () => {
    const drag = makeDrag(false);
    const { onSelect } = draw({ drag });
    fireEvent.click(screen.getByRole('button', { name: /Number/ }));
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });
});

describe('FieldPalette — the per-field gear', () => {
  it('renders no gears without the handler, one per field with it', () => {
    draw();
    expect(screen.queryAllByRole('button', { name: 'Edit this data field' })).toHaveLength(0);
    draw({ onOpenField: vi.fn() });
    expect(screen.getAllByRole('button', { name: 'Edit this data field' }).length).toBeGreaterThan(
      0,
    );
  });

  it('hands up the owning group id and the field key', () => {
    const onOpenField = vi.fn();
    draw({ onOpenField });
    // `Number` lives under the `receipt` object group. The palette flattens
    // object groups to DOTTED FULL keys while the group keeps its own id, and
    // the pair is exactly what `selectionKey` addresses on the editor side —
    // so the jump round-trips.
    const row = screen.getByText('Number').closest('li');
    if (row === null) {
      throw new Error('no row for Number');
    }
    fireEvent.click(within(row).getByRole('button', { name: 'Edit this data field' }));
    expect(onOpenField).toHaveBeenCalledExactlyOnceWith({
      group: 'receipt',
      key: 'receipt.number',
    });
  });

  it('keeps the gear OUTSIDE the row button — a button inside a button is invalid HTML', () => {
    draw({ onOpenField: vi.fn() });
    const row = screen.getByText('Number').closest('li');
    if (row === null) {
      throw new Error('no row for Number');
    }
    const gear = within(row).getByRole('button', { name: 'Edit this data field' });
    const rowButton = within(row)
      .getAllByRole('button')
      .find((b) => b !== gear && (b.textContent ?? '').includes('Number'));
    expect(rowButton).toBeDefined();
    expect(rowButton?.contains(gear)).toBe(false);
  });

  it('explains which part of a row is the name and which the key', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'How to read a row' }));
    expect(screen.getByText(/monospaced text under it is the data key/)).not.toBeNull();
  });

  it('lets a long display label wrap instead of overflowing the column', () => {
    draw();
    const label = screen.getByText('Number');
    expect(label.className).toContain('[overflow-wrap:anywhere]');
  });

  // The label above and the sample below have always wrapped; the two spans
  // BETWEEN them did not. The KEY is the one that cannot be bounded —
  // `leafField` clips a title but passes a property path through verbatim, so a
  // definitions file decides how wide this row wants to be. jsdom lays nothing
  // out, so the class is the evidence a unit test can offer; the real wrap is
  // confirmed in a browser.
  it('lets a long data KEY wrap instead of painting out of the row', () => {
    draw();
    const key = screen.getByText('receipt.number');
    expect(key.tagName).toBe('CODE');
    expect(key.className).toContain('[overflow-wrap:anywhere]');
  });

  it('CLIPS a hostile key for display while the pick still carries it whole', () => {
    // Wrapping alone traded a row that painted sideways for a row thousands of
    // lines tall — which buries the rest of the palette just as effectively.
    // The key is the one string here `leafField` does not bound.
    const key = `receipt.${'x'.repeat(400)}`;
    draw({ definitions: DEFINITIONS.replace('      number:', `      ${'x'.repeat(400)}:`) });
    expect(screen.queryByText(key)).toBeNull();
    const shown = screen.getByText(/^receipt\.x+…$/);
    expect(shown.textContent?.length).toBeLessThanOrEqual(121);
  });

  it('lets the type name beside the key wrap too', () => {
    // An UNKNOWN type shows verbatim rather than through the closed label map,
    // so this span is document-derived as well — clipped, but still long
    // enough to overflow a ~215px row on its own.
    draw();
    expect(screen.getByText('mystery_type').className).toContain('[overflow-wrap:anywhere]');
  });
});
