import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { StyleCaptureModal } from './StyleCaptureModal';
import type { StyleRef, StyleUsage } from './usage';

const PATH = 'sections.body.items[0]';

/** A stub controller — the modal only ever calls `applyAll` (all read data is
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
  const ref: StyleRef = { path: PATH, key: 'styleNames', names: [name], addressable: true };
  return { refs: new Map([[name, Array.from({ length: count }, () => ref)]]), truncated: false };
}

function renderCreate(
  props: {
    readonly controller?: Partial<EditorController>;
    readonly captured?: Readonly<Record<string, string | number>>;
    readonly existingNames?: readonly string[];
  } = {},
) {
  const controller = stubController(props.controller);
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <StyleCaptureModal
        open
        mode="create"
        onClose={onClose}
        controller={controller}
        path={PATH}
        captured={props.captured ?? { fontWeight: 'bold', fontSize: 20 }}
        existingNames={props.existingNames ?? []}
        currentStyleNames={[]}
      />
    </I18nProvider>,
  );
  return { controller, onClose };
}

describe('StyleCaptureModal — create', () => {
  it('renders the captured props as localized text and commits the exact plan', () => {
    const { controller, onClose } = renderCreate();
    // Captured props shown as label + value text.
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.getByText('bold')).toBeTruthy();
    expect(screen.getByText('Font size')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'putValue', keys: ['styles', 'Title'], value: { fontWeight: 'bold', fontSize: 20 } },
      { op: 'setStrings', path: PATH, keys: ['styleNames'], values: ['Title'] },
      { op: 'removeKey', path: PATH, keys: ['style', 'fontWeight'] },
      { op: 'removeKey', path: PATH, keys: ['style', 'fontSize'] },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a localized refusal and dispatches nothing on a duplicate name', () => {
    const { controller, onClose } = renderCreate({ existingNames: ['Title'] });
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'Title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByText('That name is already in use.')).toBeTruthy();
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not commit on Enter while an IME composition is active', () => {
    const { controller } = renderCreate();
    const input = screen.getByLabelText('Style name');
    fireEvent.change(input, { target: { value: 'Title' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('commits on a plain Enter (no composition)', () => {
    const { controller } = renderCreate();
    const input = screen.getByLabelText('Style name');
    fireEvent.change(input, { target: { value: 'Title' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-Enter key', () => {
    const { controller } = renderCreate();
    const input = screen.getByLabelText('Style name');
    fireEvent.change(input, { target: { value: 'Title' } });
    fireEvent.keyDown(input, { key: 'a' });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('fires onClose from the × close button (wiring, not unmount)', () => {
    const { onClose } = renderCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on Escape', () => {
    // Backdrop-click close is the same Headless UI `onClose` wiring; jsdom
    // cannot synthesize its outside-click detection (the Modal primitive's own
    // tests pin × + Escape for the same reason).
    const { onClose } = renderCreate();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders hostile captured values as inert text, styling only via the CSSOM', () => {
    renderCreate({ captured: { color: 'red;background:url(x)', fontFamily: '<img src=x>' } });
    // The raw value appears as escaped text, and no live element was minted.
    expect(screen.getByText('red;background:url(x)')).toBeTruthy();
    expect(screen.getByText('<img src=x>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});

function renderUpdate(
  props: {
    readonly controller?: Partial<EditorController>;
    readonly usage?: StyleUsage | null;
  } = {},
) {
  const controller = stubController(props.controller);
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <StyleCaptureModal
        open
        mode="update"
        onClose={onClose}
        controller={controller}
        path={PATH}
        captured={{ color: '#222222' }}
        existingNames={['base']}
        currentStyleNames={['base']}
        targetName="base"
        usage={props.usage === undefined ? usageWith('base', 2) : props.usage}
      />
    </I18nProvider>,
  );
  return { controller, onClose };
}

describe('StyleCaptureModal — update', () => {
  it('names the target, shows the ICU impact count, and commits the update ops', () => {
    const { controller, onClose } = renderUpdate();
    expect(screen.getByText('Update the style "base"')).toBeTruthy();
    expect(screen.getByText('Affects 2 places')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['styles', 'base', 'color'], value: '#222222' },
      { op: 'removeKey', path: PATH, keys: ['style', 'color'] },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('switches to the create form on "save as new style" without dispatching', () => {
    const { controller } = renderUpdate();
    fireEvent.click(screen.getByRole('button', { name: 'Save as new style' }));
    // The name input (create form) is now present; nothing was applied.
    expect(screen.getByLabelText('Style name')).toBeTruthy();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('dispatches nothing on cancel', () => {
    const { controller, onClose } = renderUpdate();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the impact line when usage is null', () => {
    renderUpdate({ usage: null });
    expect(screen.queryByText(/Affects/)).toBeNull();
  });

  it('omits the impact line when the count is zero', () => {
    renderUpdate({ usage: usageWith('base', 0) });
    expect(screen.queryByText(/Affects/)).toBeNull();
  });

  it('treats a usage index without the target as zero impact', () => {
    renderUpdate({ usage: { refs: new Map(), truncated: false } });
    expect(screen.queryByText(/Affects/)).toBeNull();
  });
});
