// The wired canvas: reads the injected transport, runs the debounced preview
// loop for the given document, and paints the result with the selection
// overlay. The last good preview stays on screen when a later edit errors —
// whether the transport threw or the render resolved `ok: false` (the reducer
// retains `lastGood` through both) — so a transient parse/validate error
// mid-typing never blanks the canvas.

import { DesignerCanvas } from '../canvas/DesignerCanvas';
import type { BoxIndex } from '../engine/types';
import { useEngineTransport } from './context';
import { DEFAULT_SCALE, usePreview } from './usePreview';

const EMPTY_BOXES: BoxIndex = { pages: [] };

export interface CanvasPreviewProps {
  readonly template: string;
  readonly params: string;
  readonly definitions?: string;
  readonly scale?: number;
  readonly selectedPath: string | null;
  readonly onSelect: (path: string) => void;
  readonly onDeselect: () => void;
}

export function CanvasPreview(props: CanvasPreviewProps) {
  const {
    template,
    params,
    definitions,
    scale = DEFAULT_SCALE,
    selectedPath,
    onSelect,
    onDeselect,
  } = props;
  const transport = useEngineTransport();
  const state = usePreview(transport, template, { params, definitions, scale });

  return (
    <div className="sj-canvas-preview" data-status={state.status}>
      {state.lastGood !== null ? (
        <DesignerCanvas
          pages={state.lastGood.pages}
          boxes={state.lastGood.inspect?.boxes ?? EMPTY_BOXES}
          margin={state.lastGood.inspect?.margin ?? null}
          scale={scale}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDeselect={onDeselect}
        />
      ) : null}
      {state.error !== null ? (
        <div
          className="mx-auto mt-3 w-fit rounded-md bg-error-bg px-3 py-2 text-error-text"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}
    </div>
  );
}
