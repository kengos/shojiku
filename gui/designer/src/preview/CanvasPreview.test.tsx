import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineTransport, RenderOutcome } from '../engine/transport';
import type { InspectEnvelope } from '../engine/types';
import { CanvasPreview } from './CanvasPreview';
import { EngineProvider } from './context';
import { DEFAULT_DEBOUNCE_MS } from './usePreview';

const inspect = (): InspectEnvelope => ({
  engine: { version: '0', capabilities: [], builtinLocales: [] },
  document: null,
  boxes: { pages: [[]] },
  margin: [0, 0, 0, 0],
});

const okOutcome = (): RenderOutcome => ({
  ok: true,
  pages: [{ width: 1, height: 1, rgba: new Uint8Array(4) }],
  inspect: inspect(),
  diagnostics: { items: [] },
});

const parseErrorOutcome = (): RenderOutcome => ({
  ok: false,
  pages: [],
  inspect: null,
  diagnostics: { items: [] },
});

function transportWith(renderRaw: EngineTransport['renderRaw']): EngineTransport {
  return { validate: vi.fn(), renderRaw };
}

function renderPreview(transport: EngineTransport, scale?: number) {
  return render(
    <EngineProvider transport={transport}>
      <CanvasPreview
        template="tpl"
        params="p"
        scale={scale}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />
    </EngineProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CanvasPreview', () => {
  it('shows nothing but the rendering status before the first result', () => {
    vi.useFakeTimers();
    const { container } = renderPreview(transportWith(vi.fn().mockResolvedValue(okOutcome())));
    const root = container.querySelector('.sj-canvas-preview');
    expect(root?.getAttribute('data-status')).toBe('rendering');
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('paints the canvas with the inspect boxes once a render lands', async () => {
    vi.useFakeTimers();
    const { container } = renderPreview(transportWith(vi.fn().mockResolvedValue(okOutcome())), 2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(container.querySelector('.sj-canvas-preview')?.getAttribute('data-status')).toBe(
      'ready',
    );
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('falls back to an empty box index when an ok outcome has no inspect', async () => {
    vi.useFakeTimers();
    const noInspect: RenderOutcome = { ...okOutcome(), inspect: null };
    const { container } = renderPreview(transportWith(vi.fn().mockResolvedValue(noInspect)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('paints nothing when the FIRST result already resolves ok:false', async () => {
    vi.useFakeTimers();
    const { container } = renderPreview(
      transportWith(vi.fn().mockResolvedValue(parseErrorOutcome())),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    // No ok render has ever landed, so there is no last-good preview to keep —
    // the canvas stays absent (the outcome's diagnostics explain elsewhere).
    expect(container.querySelector('.sj-canvas')).toBeNull();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('surfaces a transport error as an alert with no prior preview', async () => {
    vi.useFakeTimers();
    const { container } = renderPreview(
      transportWith(vi.fn().mockRejectedValue(new Error('kaboom'))),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('kaboom');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('keeps the last good preview on screen when a later edit fails', async () => {
    vi.useFakeTimers();
    const renderRaw = vi
      .fn()
      .mockResolvedValueOnce(okOutcome())
      .mockRejectedValueOnce(new Error('mid-typing parse crash'));
    const transport = transportWith(renderRaw);
    const view = render(
      <EngineProvider transport={transport}>
        <CanvasPreview
          template="v1"
          params="p"
          selectedPath={null}
          onSelect={() => {}}
          onDeselect={() => {}}
        />
      </EngineProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    // Edit the document; the re-render fails — the stale-but-good preview must
    // stay up alongside the error instead of blanking the canvas.
    view.rerender(
      <EngineProvider transport={transport}>
        <CanvasPreview
          template="v2"
          params="p"
          selectedPath={null}
          onSelect={() => {}}
          onDeselect={() => {}}
        />
      </EngineProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(
      'mid-typing parse crash',
    );
  });

  it('keeps the last good preview when a later render resolves ok:false', async () => {
    vi.useFakeTimers();
    const renderRaw = vi
      .fn()
      .mockResolvedValueOnce(okOutcome())
      // The engine's parse/validate failure is a RESOLVED outcome, never a
      // throw — the invalid mid-edit document must not blank the canvas.
      .mockResolvedValueOnce(parseErrorOutcome());
    const transport = transportWith(renderRaw);
    const props = {
      params: 'p',
      selectedPath: null,
      onSelect: () => {},
      onDeselect: () => {},
    };
    const view = render(
      <EngineProvider transport={transport}>
        <CanvasPreview template="v1" {...props} />
      </EngineProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    view.rerender(
      <EngineProvider transport={transport}>
        <CanvasPreview template="v2 (invalid)" {...props} />
      </EngineProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
    // No transport error: the failure speaks through the outcome's diagnostics.
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
  });
});
