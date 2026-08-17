import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PageSetup } from './PageSetup';
import { PAGE_SIZE_NAMES } from './pageSizes';

function makeController(
  page: unknown,
  overrides: Partial<EditorController> = {},
): EditorController {
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
  };
}

function draw(node: ReactElement, locale = 'en-US') {
  return render(<I18nProvider locale={locale}>{node}</I18nProvider>);
}

describe('PageSetup', () => {
  it('defaults to A4 portrait with the locale-preferred size group', () => {
    const { container } = draw(<PageSetup controller={makeController(undefined)} />);
    expect((screen.getByLabelText('Size') as HTMLSelectElement).value).toBe('A4');
    expect((screen.getByLabelText('Orientation') as HTMLSelectElement).value).toBe('portrait');
    // en-US leads its group with Letter (the registry's region-preferred order).
    const group = container.querySelector('optgroup[label="Common sizes"]');
    expect(group?.querySelector('option')?.getAttribute('value')).toBe('Letter');
    // No custom row while a named size is selected.
    expect(screen.queryByLabelText('Unit')).toBeNull();
  });

  it('omits the locale group for an unrecognized locale', () => {
    const { container } = draw(<PageSetup controller={makeController(undefined)} />, 'de-DE');
    expect(container.querySelector('optgroup[label="Common sizes"]')).toBeNull();
    // The full engine list is always present — under the "other sizes" heading,
    // which is what the second group holds once the common ones are hoisted out
    // of it (with no common group, "other" is simply everything).
    expect(container.querySelector('optgroup[label="Other sizes"]')).not.toBeNull();
  });

  it('surfaces an unknown loaded size as its own option', () => {
    const { container } = draw(<PageSetup controller={makeController({ size: 'B6' })} />);
    const select = screen.getByLabelText('Size') as HTMLSelectElement;
    expect(select.value).toBe('B6');
    // The unknown name is its own option and its bare-name thumbnail caption.
    expect(container.querySelector('figcaption')?.textContent).toBe('B6');
  });

  it('dispatches a size-select change as a batch', () => {
    const controller = makeController(undefined);
    draw(<PageSetup controller={controller} />);
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'Letter' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['page', 'size'], value: 'Letter' },
    ]);
  });

  it('switches to a custom size through the sentinel option', () => {
    const controller = makeController(undefined);
    draw(<PageSetup controller={controller} />);
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'custom' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '210mm' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '297mm' },
    ]);
  });

  it('renders the custom inputs and disables orientation in custom mode', () => {
    draw(<PageSetup controller={makeController({ size: { w: '8.5in', h: '13in' } })} />);
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('8.5');
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('13');
    expect((screen.getByLabelText('Unit') as HTMLSelectElement).value).toBe('in');
    expect((screen.getByLabelText('Orientation') as HTMLSelectElement).disabled).toBe(true);
  });

  it('commits a custom dimension on blur', () => {
    const controller = makeController({ size: { w: '8.5in', h: '13in' } });
    draw(<PageSetup controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Width'), { target: { value: '9' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['page', 'size', 'w'],
      value: '9in',
    });
  });

  it('commits the height dimension on blur', () => {
    const controller = makeController({ size: { w: '8.5in', h: '13in' } });
    draw(<PageSetup controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Height'), { target: { value: '14' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['page', 'size', 'h'],
      value: '14in',
    });
  });

  it('dispatches nothing on a blur that did not change the value', () => {
    // The displayed numeral can be a converted view of a mixed-unit wire value;
    // a tab-through must never rewrite the authored form.
    const controller = makeController({ size: { w: '8.5in', h: '200mm' } });
    draw(<PageSetup controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Width'), { target: { value: '8.5' } });
    fireEvent.blur(screen.getByLabelText('Height'), { target: { value: '7.87' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('dispatches nothing when a custom dimension is cleared to an invalid value', () => {
    const controller = makeController({ size: { w: '8.5in', h: '13in' } });
    draw(<PageSetup controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Width'), { target: { value: '' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('reinterprets both dimensions when the unit changes', () => {
    const controller = makeController({ size: { w: '1in', h: '2in' } });
    draw(<PageSetup controller={controller} />);
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'pt' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '72pt' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '144pt' },
    ]);
  });

  it('writes the orientation key when landscape is chosen', () => {
    const controller = makeController({ size: 'A4' });
    draw(<PageSetup controller={controller} />);
    fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'landscape' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['page', 'orientation'],
      value: 'landscape',
    });
  });

  it('clears the orientation key when returning to portrait', () => {
    const controller = makeController({ size: 'A4', orientation: 'landscape' });
    draw(<PageSetup controller={controller} />);
    fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'portrait' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      keys: ['page', 'orientation'],
    });
  });

  it('labels the size thumbnail with the current dimensions', () => {
    draw(<PageSetup controller={makeController({ size: 'A4' })} />);
    expect(screen.getByText('210 × 297 mm')).toBeDefined();
  });
});

describe('PageSetup — the size list offers each size exactly once', () => {
  /** Every `<option>` value in the size select, groups flattened. */
  function sizeOptions(container: HTMLElement): string[] {
    const select = screen.getByLabelText('Size') as HTMLSelectElement;
    void container;
    return Array.from(select.querySelectorAll('option'), (o) => o.getAttribute('value') ?? '');
  }

  it('lists a locale-preferred size ONCE, not in both groups', () => {
    // The two groups used to overlap: an en-US user saw `Letter` under "Common
    // sizes" and again under "All sizes", with nothing to tell the two entries
    // apart — a worse answer to "which do I pick" than a shorter second list.
    const { container } = draw(<PageSetup controller={makeController(undefined)} />, 'en-US');
    const values = sizeOptions(container);
    expect(values.filter((v) => v === 'Letter')).toEqual(['Letter']);
    expect(values.filter((v) => v === 'A4')).toEqual(['A4']);
  });

  it('drops no size from the list while deduplicating', () => {
    // The dedup removes a DUPLICATE, never a choice: everything the registry
    // knows is still reachable, plus the custom entry.
    const { container } = draw(<PageSetup controller={makeController(undefined)} />, 'en-US');
    const values = sizeOptions(container);
    for (const name of PAGE_SIZE_NAMES) {
      expect(values, name).toContain(name);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it('offers a single ungrouped list for a locale with no preferred sizes', () => {
    const { container } = draw(<PageSetup controller={makeController(undefined)} />, 'zz');
    expect(container.querySelector('optgroup[label="Common sizes"]')).toBeNull();
    const values = sizeOptions(container);
    expect(new Set(values).size).toBe(values.length);
    for (const name of PAGE_SIZE_NAMES) {
      expect(values, name).toContain(name);
    }
  });
});
