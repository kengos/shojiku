// The composer's TAIL: the canvas-side surfaces (page nav, palette drag, image
// import, inline editing), the host change notification, and the two document
// derivations the chrome reads. A contiguous suffix of the wiring order — the
// `useHostNotify` effect keeps its position between the inline editor and the
// PDF action, so effect order is unchanged.

import { useCallback } from 'react';
import { DEFAULT_IMAGE_BUDGETS } from '../image/model';
import { pageSummary, readPageView } from '../panel/pageSetupModel';
import type { DesignerProps } from '../props';
import { useDocDerived } from './useDocDerived';
import type { DocumentCore } from './useDocumentCore';
import { useHostNotify } from './useHostNotify';
import { useImageImport } from './useImageImport';
import { useInlineEdit } from './useInlineEdit';
import type { useMultiSelect } from './useMultiSelect';
import { usePageNav } from './usePageNav';
import { usePaletteDrag } from './usePaletteDrag';
import { usePdfAction } from './usePdfAction';

export interface CanvasWiring {
  readonly nav: ReturnType<typeof usePageNav>;
  readonly drag: ReturnType<typeof usePaletteDrag>;
  readonly image: ReturnType<typeof useImageImport>;
  readonly inline: ReturnType<typeof useInlineEdit>;
  readonly pdf: ReturnType<typeof usePdfAction>;
  readonly derived: ReturnType<typeof useDocDerived>;
}

/** The upstream values the tail consumes from the middle of the wiring order. */
export interface CanvasWiringDeps {
  readonly selectClearing: ReturnType<typeof useMultiSelect>['selectClearing'];
  readonly canDeclare: boolean;
}

export function useCanvasWiring(
  props: DesignerProps,
  core: DocumentCore,
  { selectClearing, canDeclare }: CanvasWiringDeps,
): CanvasWiring {
  const { capabilities, imageCodec, onChange, menuActions, defaultFontFamily } = props;
  const { transport, cap, editor, sample, defs, session } = core;
  const imageBudgets = props.imageBudgets ?? DEFAULT_IMAGE_BUDGETS;

  const nav = usePageNav();
  const drag = usePaletteDrag({
    lastGood: session.preview.lastGood,
    editor,
    selectClearing,
    capabilities,
    workshop: sample.workshop,
    canDeclare,
  });
  const image = useImageImport({
    imageCodec,
    imageBudgets,
    editor,
    maxBytes: cap.maxBytes,
    setMaxBytesState: cap.setMaxBytes,
    onTemplateMaxBytesChange: props.onTemplateMaxBytesChange,
    selectClearing,
    lastGoodRef: drag.lastGoodRef,
    pageHitAt: drag.pageHitAt,
  });
  const inline = useInlineEdit({
    editor,
    paletteGroups: defs.paletteGroups,
    params: sample.params,
    capabilities,
  });

  // Notify the host when the TEXT changes (not on a mere selection change, which
  // also bumps the editor revision).
  useHostNotify(editor.text, onChange);

  const pdf = usePdfAction({
    transport,
    onDownloadPdf: menuActions?.onDownloadPdf,
    capabilities,
    text: editor.text,
    params: sample.params,
    definitions: defs.definitionsForEngine,
    // Read at RENDER time, not at display time: the preview's page line must
    // describe the bytes it is shown beside, and the document can still move
    // behind an open modal (the window-level undo is guarded against editable
    // targets only, and a modal's close button is not one).
    readPageLabel: useCallback(() => pageSummary(readPageView(editor.read('page'))), [editor.read]),
  });
  const derived = useDocDerived(editor.text, defaultFontFamily, transport, defs.paletteGroups);

  return { nav, drag, image, inline, pdf, derived };
}
