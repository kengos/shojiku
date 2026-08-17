// The Designer's composer: ONE call per wiring concern, in the order the
// concerns feed each other — this file owns the hook-call ORDER (effects run in
// call order, so reordering here is a behavior change), while `Designer.tsx`
// owns only the render tree it threads the results into. The head of the order
// (`useDocumentCore`) and its tail (`useCanvasWiring`) are each a CONTIGUOUS
// run of that same sequence lifted into one call, so the effects they contain
// keep their original positions; the middle — the edit surfaces and the
// Designer-local dialog state — stays here, as do the cross-concern values the
// shell children thread. The shell children stay presentational.

import type { Op } from '@shojiku/designer-core';
import { useCallback } from 'react';
import { useAdvisories } from './hooks/useAdvisories';
import { useBlocks } from './hooks/useBlocks';
import { useCanvasWiring } from './hooks/useCanvasWiring';
import { useChromeDialogs } from './hooks/useChromeDialogs';
import { useContainerMarks } from './hooks/useContainerMarks';
import { useCopilot } from './hooks/useCopilot';
import { useDocumentCore } from './hooks/useDocumentCore';
import { useDocViews } from './hooks/useDocViews';
import { useEditorPrefs } from './hooks/useEditorPrefs';
import { useInsertActions } from './hooks/useInsertActions';
import { useMultiSelect } from './hooks/useMultiSelect';
import { useSaveFlow } from './hooks/useSaveFlow';
import { useSelectionOps } from './hooks/useSelectionOps';
import { useTutorialWiring } from './hooks/useTutorialWiring';
import { hostConfigOf } from './hostConfig';
import type { DesignerProps } from './props';
import type { DesignerWiring } from './wiringTypes';

export function useDesignerWiring(props: DesignerProps): DesignerWiring {
  const {
    source,
    onSave,
    tutorialStore,
    synth,
    capabilities,
    defaultGridStep,
    onGridStepChange,
    defaultSidebarWidth,
    onSidebarWidthChange,
    imageCodec,
    blocks: hostBlocks,
    onBlocksChange,
    copilot: copilotProvider,
  } = props;

  const core = useDocumentCore(props);
  const { transport, t, locale, cap, editor, sample, defs, session } = core;
  const preview = session.preview;

  const copilot = useCopilot({
    copilot: copilotProvider,
    text: editor.text,
    effectiveDefinitions: defs.effectiveDefinitions,
    selection: editor.selection,
    params: sample.params,
    maxBytes: cap.maxBytes,
  });
  const prefs = useEditorPrefs({
    defaultGridStep,
    onGridStepChange,
    defaultSidebarWidth,
    onSidebarWidthChange,
  });

  const multi = useMultiSelect({ editor, inspectBoxes: session.boxes });
  const views = useDocViews({ selection: editor.selection, clearSelection: editor.clearSelection });

  const inserts = useInsertActions({
    editor,
    t,
    lastGood: preview.lastGood,
    params: sample.params,
    sampleSet: sample.sampleSet,
    commitSet: sample.commitSet,
    synth,
    locale,
    capabilities,
    hasImageCodec: imageCodec !== undefined,
    paletteGroups: defs.paletteGroups,
    workshop: sample.workshop,
  });
  const blocks = useBlocks({
    blocks: hostBlocks,
    onBlocksChange,
    editor,
    multiSel: multi.multiSel,
    previewRef: inserts.previewRef,
  });
  const selectionOps = useSelectionOps({
    editor,
    deselectClearing: multi.deselectClearing,
    docViewOpenRef: views.docViewOpenRef,
    dataViewOpenRef: views.dataViewOpenRef,
    closeDocView: views.closeDocView,
    closeDataView: views.closeDataView,
  });

  // A diagnostics quick-fix: the fix model already built the op batch; one
  // transactional `applyAll` lands it as a single undo step. Diagnostics re-derive
  // on the next render, so the fixed row drops on its own — no manual refresh.
  const { applyAll } = editor;
  const applyDiagnosticFix = useCallback((ops: readonly Op[]) => void applyAll(ops), [applyAll]);

  const marks = useContainerMarks({
    selection: editor.selection,
    read: editor.read,
    t,
    text: editor.text,
  });

  const dialogs = useChromeDialogs();
  // Pure derivation over the last-good inspect (no effect), so its position in
  // the call order carries no behavior.
  const advisories = useAdvisories(preview, capabilities);
  const save = useSaveFlow({
    transport,
    text: editor.text,
    params: sample.params,
    definitionsForEngine: defs.definitionsForEngine,
    onSave,
    source,
  });
  const tutorial = useTutorialWiring({
    editor,
    sampleSetRef: sample.sampleSetRef,
    commitSet: sample.commitSet,
    setBaselineText: save.setBaselineText,
    selection: editor.selection,
    pageCount: preview.lastGood?.pages.length ?? 0,
    tutorialStore,
    locale,
    t,
  });
  // A field edit reports the tutorial's ui-event, then rewrites the ACTIVE
  // variant's text. Composed here because the ui-event comes from the tutorial
  // wiring, which in turn drives the document through the sample surfaces.
  const handleParamsChange = (next: string) => {
    tutorial.uiEvent('sample:edited');
    sample.applyParamsEdit(next);
  };

  const canvas = useCanvasWiring(props, core, {
    selectClearing: multi.selectClearing,
    canDeclare: inserts.canDeclare,
  });

  return {
    ...canvas,
    editor,
    cap,
    sample,
    defs,
    session,
    copilot,
    prefs,
    multi,
    views,
    inserts,
    blocks,
    selectionOps,
    marks,
    save,
    tutorial,
    themeStyle: core.themeStyle,
    // Diagnostics always come from the LATEST outcome (an ok:false render's
    // errors must show); the canvas paints the retained last-good pages, so an
    // invalid mid-edit document never blanks the page.
    diagnostics: preview.outcome?.diagnostics.items ?? [],
    advisories,
    applyDiagnosticFix,
    handleParamsChange,
    // The host configuration resolved ONCE (defaults applied here and nowhere
    // else), and the chrome dialog flags as the one bundle their hook returns —
    // neither is spread flat into this result, so the shell children take one
    // named prop instead of nine loose ones.
    host: hostConfigOf(props, locale),
    dialogs,
  };
}
