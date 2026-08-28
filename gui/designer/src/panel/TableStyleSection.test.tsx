import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { swatchLabel } from '../testkit/swatchLabel';
import { TableStyleSection } from './TableStyleSection';

const PATH = 'sections.body.items[0]';

function makeController(node: unknown, rest: Record<string, unknown> = {}): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === PATH ? node : rest[path]),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(element: ReactElement) {
  return render(<I18nProvider locale="en">{element}</I18nProvider>);
}

/** Mount the section the way its HOST does — with nothing but its own context.
 * This is not a convenience: appearance editing is expected to move into a modal
 * sheet, and the section must already be mountable outside the property panel
 * for that to be a change of render site rather than a rewrite. */
function section(
  node: unknown,
  capabilities: readonly string[] | undefined = undefined,
  rest: Record<string, unknown> = {},
  floor?: Readonly<Record<string, unknown>>,
) {
  const controller = makeController(node, rest);
  draw(<TableStyleSection context={{ path: PATH, controller, capabilities, floor }} />);
  return controller;
}

const TABLE = { type: 'table', data: { key: 'rows' }, columns: [{ data: { key: 'a' } }] };

function openDetail() {
  fireEvent.click(screen.getByRole('button', { name: 'Detailed formatting' }));
}

describe('TableStyleSection', () => {
  it('mounts standalone, outside the property panel, over its own context alone', () => {
    section(TABLE);
    expect(screen.getByRole('heading', { name: 'Table style' })).not.toBeNull();
    expect(screen.getByRole('table', { name: 'Preview of the table banding' })).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Banded rows' })).not.toBeNull();
  });

  it('renders nothing when the engine lacks the table-style capability', () => {
    section(TABLE, ['style.border']);
    expect(screen.queryByRole('heading', { name: 'Table style' })).toBeNull();
  });

  it('renders when the engine declares the capability', () => {
    section(TABLE, ['table.style']);
    expect(screen.getByRole('heading', { name: 'Table style' })).not.toBeNull();
  });

  it('turns the zebra overlay on with the default stripe', () => {
    const controller = section(TABLE);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Banded rows' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['row', 'alternateStyle', 'backgroundColor'],
      value: '#f6f8fa',
    });
  });

  it('turns it off again by removing only the key the checkbox owns', () => {
    const controller = section({
      ...TABLE,
      row: { alternateStyle: { backgroundColor: '#f6f8fa' }, alternateStyleNames: ['stripe'] },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Banded rows' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['row', 'alternateStyle', 'backgroundColor'],
    });
  });

  it('reads the checkbox state from the WIRE, not from a local toggle', () => {
    section({ ...TABLE, row: { alternateStyle: { backgroundColor: '#f6f8fa' } } });
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Banded rows' }).checked).toBe(
      true,
    );
  });

  it('applies a gallery preset as ONE batch', () => {
    const controller = section(TABLE);
    fireEvent.click(screen.getByRole('button', { name: /Dark header/ }));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: PATH,
        keys: ['header', 'style', 'backgroundColor'],
        value: '#374151',
      },
      { op: 'setScalar', path: PATH, keys: ['header', 'style', 'color'], value: '#ffffff' },
      { op: 'setScalar', path: PATH, keys: ['header', 'style', 'fontWeight'], value: 'bold' },
    ]);
  });

  it('marks the matching preset pressed, read from the document', () => {
    section({ ...TABLE, row: { alternateStyle: { backgroundColor: '#f6f8fa' } } });
    expect(screen.getByRole('button', { name: /Banded/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /Plain header/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('authors nothing when the already-active preset is clicked again', () => {
    const controller = section(TABLE);
    fireEvent.click(screen.getByRole('button', { name: /^Plain$/ }));
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('edits a header property from the detail, at the header key path', () => {
    const controller = section(TABLE);
    openDetail();
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Bold' })[0]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['header', 'style', 'fontWeight'],
      value: 'bold',
    });
  });

  it('edits a body-row property at the row key path, not the header’s', () => {
    const controller = section(TABLE);
    openDetail();
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Bold' })[1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['row', 'style', 'fontWeight'],
      value: 'bold',
    });
  });

  it('clears a header property when its control is switched back off', () => {
    const controller = section({ ...TABLE, header: { style: { fontWeight: 'bold' } } });
    openDetail();
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Bold' })[0]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['header', 'style', 'fontWeight'],
    });
  });

  it('says the header fill is the engine default while it is unset', () => {
    section(TABLE);
    openDetail();
    expect(screen.getByText('#ededed')).not.toBeNull();
  });

  it('authors nothing when the already-active alignment is re-picked', () => {
    // The no-dispatch half is the PLATFORM's doing (a native radio fires no
    // change for the checked option), so on its own the assertion could pass
    // over a control that dispatches nothing at all. The positive control is
    // what makes it discriminating: a DIFFERENT alignment in the same harness
    // must dispatch.
    const controller = section({ ...TABLE, header: { style: { textAlign: 'center' } } });
    openDetail();
    const centre = screen.getAllByRole<HTMLInputElement>('radio', { name: 'Center' })[0];
    expect(centre.checked).toBe(true);
    fireEvent.click(centre);
    expect(controller.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('radio', { name: 'Right' })[0]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['header', 'style', 'textAlign'],
      value: 'right',
    });
  });

  it('keeps a hostile colour out of every inline style', () => {
    // Reported by the model, refused at the render site: the miniature and the
    // swatch chip both go through `isHexColor`, so the document's string never
    // becomes CSS.
    section({ ...TABLE, header: { style: { backgroundColor: 'url(javascript:alert(1))' } } });
    expect(document.body.innerHTML).not.toContain('javascript:alert');
    openDetail();
    expect(document.body.innerHTML).not.toContain('javascript:alert');
  });

  it('shows nothing about an ineffective fill when the table authors none', () => {
    section(TABLE);
    expect(screen.queryByRole('button', { name: 'Remove the fill' })).toBeNull();
  });

  it('offers to clear a table fill the engine will not paint', () => {
    const controller = section({ ...TABLE, style: { backgroundColor: '#00ff00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove the fill' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['style', 'backgroundColor'],
    });
  });

  it('draws the miniature without a grid when the preset switched it off', () => {
    // jsdom serializes `border: none` as `border: medium`, so the assertion is
    // on the parsed style property rather than on the attribute text.
    section({ ...TABLE, style: { borderWidth: 0 } });
    const table = screen.getByRole<HTMLTableElement>('table', {
      name: 'Preview of the table banding',
    });
    expect(table.querySelector('th')?.style.borderStyle).toBe('none');
    section(TABLE);
    expect(
      screen
        .getAllByRole<HTMLTableElement>('table', { name: 'Preview of the table banding' })[1]
        .querySelector('th')?.style.borderStyle,
    ).toBe('solid');
  });

  it('reads a per-side grid width as hand-tuned, and a hostile one as unset', () => {
    // A per-side map is the border editor's own output when the sides differ;
    // reporting it as unset would mark `plain` active over an outer frame.
    section({ ...TABLE, style: { borderWidth: { top: 2, right: 0, bottom: 2, left: 0 } } });
    expect(screen.getByRole('button', { name: /^Plain$/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    section({ ...TABLE, style: { borderWidth: Number.NaN } });
    expect(screen.getAllByRole('button', { name: /^Plain$/ })[1].getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('degrades to an all-unset section on a node it cannot read', () => {
    section('not-a-table');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Banded rows' }).checked).toBe(
      false,
    );
    expect(screen.getByRole('button', { name: /^Plain$/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
  it('picks a header fill from the swatch palette, never typed as hex', () => {
    const controller = section(TABLE);
    openDetail();
    fireEvent.click(screen.getAllByRole('button', { name: 'Background' })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['header', 'style', 'backgroundColor'],
      value: '#b91c1c',
    });
  });

  it('picks a body-row text colour at the row key path', () => {
    const controller = section(TABLE);
    openDetail();
    fireEvent.click(screen.getAllByRole('button', { name: 'Color' })[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['row', 'style', 'color'],
      value: '#b91c1c',
    });
  });

  it('clears a band colour through the picker’s clear row', () => {
    const controller = section({ ...TABLE, row: { style: { color: '#b91c1c' } } });
    openDetail();
    fireEvent.click(screen.getAllByRole('button', { name: 'Color' })[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['row', 'style', 'color'],
    });
  });

  it('picks a header alignment at the header key path', () => {
    const controller = section(TABLE);
    openDetail();
    fireEvent.click(screen.getAllByRole('radio', { name: 'Right' })[0]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['header', 'style', 'textAlign'],
      value: 'right',
    });
  });
  it('draws the miniature’s labels in the band’s OWN text colour', () => {
    // Found by looking at the running app: a dark header fill goes with light
    // label text, and a fixed ink made the miniature unreadable AND wrong about
    // the document. jsdom cannot see "unreadable", so the colour is asserted.
    section({
      ...TABLE,
      header: { style: { backgroundColor: '#1a3c6e', color: '#ffffff' } },
      row: { style: { color: '#444444' } },
    });
    const mini = screen.getByRole<HTMLTableElement>('table', {
      name: 'Preview of the table banding',
    });
    expect(mini.querySelector('th')?.style.color).toBe('rgb(255, 255, 255)');
    expect(mini.querySelector('td')?.style.color).toBe('rgb(68, 68, 68)');
  });

  it('falls back to ink for a band that sets no text colour', () => {
    section(TABLE);
    const mini = screen.getByRole<HTMLTableElement>('table', {
      name: 'Preview of the table banding',
    });
    expect(mini.querySelector('th')?.style.color).toBe('rgb(43, 39, 36)');
  });
});

describe('TableStyleSection — the miniature draws the PAGE, the gallery reads the WIRE', () => {
  it('carries an inherited ink into the miniature', () => {
    section(TABLE, undefined, { defaults: { style: { color: '#00aa00', fontWeight: 'bold' } } });
    const header = screen.getByRole('columnheader', { name: 'A' });
    expect(header.getAttribute('style')).toContain('rgb(0, 170, 0)');
    expect(header.getAttribute('style')).toContain('font-weight: 700');
  });

  // A preset describes what it AUTHORS. If an inherited colour could make one
  // read as active, clicking it would author nothing and the gallery would lie.
  it('does not let an inherited ink make a preset read as active', () => {
    section(TABLE, undefined, { defaults: { style: { color: '#ffffff' } } });
    const active = screen
      .getAllByRole('button', { pressed: true })
      .map((button) => button.textContent);
    expect(active).toEqual(['Plain']);
  });

  it('opens the detail with the bands intact and authors nothing by rendering', () => {
    const controller = section(TABLE, undefined, { defaults: { style: { color: '#00aa00' } } });
    openDetail();
    expect(screen.getAllByRole('group', { name: 'Text alignment' })).toHaveLength(2);
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('still clears the LAST band property with a key removal, pruning the map', () => {
    const controller = section({ ...TABLE, row: { style: { fontWeight: 'bold' } } });
    openDetail();
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Bold' })[1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['row', 'style', 'fontWeight'],
    });
  });
});

describe('TableStyleSection — the invisible header row', () => {
  const NAME = 'Hide the header row on the page';
  const NOTE = 'The header row is hidden on the page, so none of the settings below are drawn';

  // GUI-7. This switch used to live inside 「Detailed formatting」, one
  // disclosure down, while the zebra switch — its exact peer — sat at the top.
  // Every test below therefore opened the disclosure first; none of them do
  // now, and that deletion IS the assertion.
  it('is reachable WITHOUT opening the detail, beside the zebra switch', () => {
    section(TABLE, ['table.style', 'table.header.visuallyHidden']);
    expect(
      screen.queryByRole('button', { name: /Detailed formatting/ })?.getAttribute('aria-expanded'),
    ).toBe('false');
    expect(screen.getByRole('checkbox', { name: NAME })).not.toBeNull();
  });

  it('leaves the zebra switch alone when the engine lacks the capability', () => {
    // The row is ABSENT rather than disabled, and its absence must not take
    // its neighbour with it.
    section(TABLE, ['table.style']);
    expect(screen.queryByRole('checkbox', { name: NAME })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Banded rows' })).not.toBeNull();
  });

  it('authors nothing by being moved', () => {
    // A pure relocation: rendering the section must still emit no op.
    const controller = section(TABLE, ['table.style', 'table.header.visuallyHidden']);
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('keeps the NOTE beside the band fields it is about, inside the detail', () => {
    // The other end of the same idea, and the reason the split is a split: the
    // note names the header band's fields, so a reader has to be able to see
    // them. Hidden while the disclosure is closed, present once it is open.
    section({ ...TABLE, header: { visuallyHidden: true } }, [
      'table.style',
      'table.header.visuallyHidden',
    ]);
    expect(screen.queryByText(new RegExp(NOTE))).toBeNull();
    openDetail();
    expect(screen.getByText(new RegExp(NOTE))).not.toBeNull();
  });

  it('shows no note while the header row is NOT hidden', () => {
    section(TABLE, ['table.style', 'table.header.visuallyHidden']);
    openDetail();
    expect(screen.queryByText(new RegExp(NOTE))).toBeNull();
  });

  it('is ABSENT when the engine lacks the capability', () => {
    // An older engine parse-REJECTS `header.visuallyHidden`, so a hopeful
    // checkbox would break the document the moment it was ticked.
    section(TABLE, ['table.style']);
    expect(screen.queryByRole('checkbox', { name: NAME })).toBeNull();
  });

  it('is PRESENT when the capability list carries the key', () => {
    section(TABLE, ['table.style', 'table.header.visuallyHidden']);
    expect(screen.getByRole('checkbox', { name: NAME })).not.toBeNull();
  });

  it('authors the key when ticked', () => {
    const controller = section(TABLE, ['table.style', 'table.header.visuallyHidden']);
    fireEvent.click(screen.getByRole('checkbox', { name: NAME }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: PATH,
      keys: ['header', 'visuallyHidden'],
      value: true,
    });
  });

  it('REMOVES the key when unticked, rather than writing false', () => {
    // An unset key already means false, and the op layer prunes the `header:`
    // map when this was its last entry — so the document returns to the shape
    // it had before the checkbox was ever touched.
    const controller = section({ ...TABLE, header: { visuallyHidden: true } }, [
      'table.style',
      'table.header.visuallyHidden',
    ]);
    const box = screen.getByRole('checkbox', { name: NAME }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: PATH,
      keys: ['header', 'visuallyHidden'],
    });
  });

  it('reads its state from the WIRE, so an externally-authored document shows it', () => {
    section({ ...TABLE, header: { visuallyHidden: true } }, [
      'table.style',
      'table.header.visuallyHidden',
    ]);
    expect((screen.getByRole('checkbox', { name: NAME }) as HTMLInputElement).checked).toBe(true);
  });

  it('stays OFF for a hostile non-boolean value', () => {
    // Only the boolean the engine acts on may light the control up.
    for (const hostile of ['true', 1, {}, []]) {
      section({ ...TABLE, header: { visuallyHidden: hostile } }, [
        'table.style',
        'table.header.visuallyHidden',
      ]);
      expect((screen.getByRole('checkbox', { name: NAME }) as HTMLInputElement).checked).toBe(
        false,
      );
      cleanup();
    }
  });
});
