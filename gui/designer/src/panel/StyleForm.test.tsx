import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { StyleUsage } from '../styles/usage';
import { StyleForm } from './StyleForm';
import { STYLE_FORM_ROWS } from './StyleFormFields';
import { STYLE_FIELDS } from './styleFieldSpecs';

/** A stub controller — the form only ever calls `applyAll` (all read data is
 * passed in as props), so the rest are inert. */
function stubController(overrides: Partial<EditorController> = {}): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: vi.fn(() => undefined),
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

function usageWith(name: string, count: number): StyleUsage {
  const ref = { path: 'p', key: 'styleNames' as const, names: [name], addressable: true };
  return { refs: new Map([[name, Array.from({ length: count }, () => ref)]]), truncated: false };
}

function renderCreate(existingNames: readonly string[] = []) {
  const controller = stubController();
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <StyleForm
        open
        mode="create"
        onClose={onClose}
        controller={controller}
        existingNames={existingNames}
      />
    </I18nProvider>,
  );
  return { controller, onClose };
}

function renderUpdate(
  props: {
    readonly name?: string;
    readonly current?: Readonly<Record<string, string>>;
    readonly usage?: StyleUsage | null;
  } = {},
) {
  const controller = stubController();
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <StyleForm
        open
        mode="update"
        onClose={onClose}
        controller={controller}
        existingNames={[props.name ?? 'body']}
        name={props.name ?? 'body'}
        current={props.current ?? { fontSize: '13', color: '#333333' }}
        usage={props.usage === undefined ? usageWith(props.name ?? 'body', 2) : props.usage}
      />
    </I18nProvider>,
  );
  return { controller, onClose };
}

describe('StyleForm — layout', () => {
  it('lays out exactly the STYLE_FIELDS keys, none dropped (drift guard)', () => {
    expect([...STYLE_FORM_ROWS].flat().sort()).toEqual(STYLE_FIELDS.map((s) => s.key).sort());
  });
});

describe('StyleForm — create', () => {
  it('authors the entry + only the touched fields in ONE applyAll, then closes', () => {
    const { controller, onClose } = renderCreate();
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'note' } });
    // A text/length field commits on BLUR; a select commits on CHANGE.
    fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: 'bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'putValue', keys: ['styles', 'note'], value: {} },
      { op: 'setScalar', keys: ['styles', 'note', 'fontSize'], value: 11 },
      { op: 'setScalar', keys: ['styles', 'note', 'fontWeight'], value: 'bold' },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the style enums in the reader’s language, committing the spelling', () => {
    renderCreate();
    const weight = screen.getByLabelText('Weight') as HTMLSelectElement;
    expect(Array.from(weight.options, (o) => o.textContent)).toContain('Bold');
  });

  it('picks a colour from the swatch popover — no hand-typed hex', () => {
    const { controller } = renderCreate();
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'note' } });
    // The colour control is a swatch trigger (a menu button), not a text input.
    const trigger = screen.getByRole('button', { name: 'Color' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Black' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'putValue', keys: ['styles', 'note'], value: {} },
      { op: 'setScalar', keys: ['styles', 'note', 'color'], value: '#000000' },
    ]);
  });

  it('shows a localized refusal and dispatches nothing on a duplicate name', () => {
    const { controller, onClose } = renderCreate(['note']);
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('That name is already in use.')).toBeTruthy();
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('commits on a plain Enter but not mid IME composition', () => {
    const { controller } = renderCreate();
    const input = screen.getByLabelText('Style name');
    fireEvent.change(input, { target: { value: 'note' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(controller.applyAll).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-Enter key', () => {
    const { controller } = renderCreate();
    fireEvent.keyDown(screen.getByLabelText('Style name'), { key: 'a' });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('renders the draft name in the live preview chip', () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'headline' } });
    expect(screen.getByText('headline')).toBeTruthy();
  });
});

describe('StyleForm — update', () => {
  it('seeds the fields, shows the impact count, and commits ONLY the change', () => {
    const { controller, onClose } = renderUpdate();
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('13');
    expect(screen.getByText('Affects 2 places')).toBeTruthy();
    fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['styles', 'body', 'fontSize'], value: 15 },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dispatches nothing when no field changed, but still closes', () => {
    const { controller, onClose } = renderUpdate();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the name read-only with a rename hint (rename is the row menu)', () => {
    renderUpdate();
    const name = screen.getByLabelText(/Style name/) as HTMLInputElement;
    expect(name.readOnly).toBe(true);
    expect(name.value).toBe('body');
    expect(screen.getByText('Rename from the row menu')).toBeTruthy();
  });

  it('omits the impact line when usage is null or the count is zero', () => {
    renderUpdate({ usage: null });
    expect(screen.queryByText(/Affects/)).toBeNull();
  });

  it('omits the impact line when the target has zero references', () => {
    renderUpdate({ usage: usageWith('body', 0) });
    expect(screen.queryByText(/Affects/)).toBeNull();
  });

  it('treats a usage index without the target as zero impact', () => {
    renderUpdate({ usage: { refs: new Map(), truncated: false } });
    expect(screen.queryByText(/Affects/)).toBeNull();
  });
});

describe('StyleForm — close wiring', () => {
  it('fires onClose from the footer Cancel, the × button, and Escape — never dispatching', () => {
    const { controller, onClose } = renderUpdate();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    // Cancelling any way never writes to the document (only 保存 dispatches).
    expect(controller.applyAll).not.toHaveBeenCalled();
  });
});

describe('StyleForm — hostile input', () => {
  it('addresses a prototype-named style by its literal key (no pollution)', () => {
    const { controller } = renderCreate();
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: '__proto__' } });
    fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'putValue', keys: ['styles', '__proto__'], value: {} },
      { op: 'setScalar', keys: ['styles', '__proto__', 'fontSize'], value: 12 },
    ]);
    expect(({} as Record<string, unknown>).fontSize).toBeUndefined();
    // The name reaches the preview chip as inert TEXT, never markup.
    expect(within(screen.getByRole('dialog')).getByText('__proto__').textContent).toBe('__proto__');
  });

  it('drops a hostile seeded value instead of letting it reach the preview DOM', () => {
    renderUpdate({
      current: { fontSize: '1e300pt', color: 'red;background-image:url(javascript:alert(1))' },
    });
    const chip = within(screen.getByRole('dialog')).getByText('body');
    // An unbounded/garbage length never reaches the DOM, and the CSSOM object
    // assignment cannot break out into a second declaration.
    expect(chip.style.fontSize).toBe('');
    expect(chip.style.backgroundImage).toBe('');
    expect(chip.getAttribute('style') ?? '').not.toContain('url(');
  });
});
