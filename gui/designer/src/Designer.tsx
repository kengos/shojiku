// The assembled Designer: an optional field palette (the read-only
// definitions view) + canvas (engine preview underlay + box overlay) +
// property panel + diagnostics + a toolbar (undo/redo, save), over ONE editing
// session. Selection is shared across all surfaces (a canvas box, a
// property-panel target, a diagnostic, and a palette field all address the
// same `path`); canvas, panel, and diagnostics all read the SAME preview state
// (last-good pages never blank while a failing edit re-renders).
//
// This file is the ASSEMBLY ONLY: the props surface lives in `props.ts`, every
// hook call in `wiring.ts` (which owns the call ORDER — effects run in it),
// and the render tree in the three `shell/` children — TopChrome, EditorBody
// (nesting SidePane + CanvasArea), and DialogHost. Host-injection points: the
// engine transport (`<EngineProvider>`), the locale + message catalog
// (`<I18nProvider>`), and the `props.ts` callbacks. The component never
// persists, fetches, or renders on its own — those are the host's.

import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel';
import { bandOf } from './hooks/geometry';
import type { DesignerProps } from './props';
import { DialogHost } from './shell/DialogHost';
import { EditorBody } from './shell/EditorBody';
import { TopChrome } from './shell/TopChrome';
import { TOUR_ANCHORS } from './tutorial/anchors';
import { useDesignerWiring } from './wiring';

// The page-geometry helpers and the editable-target guard live beside the
// wiring that uses them; re-exported here because they are part of this
// module's public surface.
export { contentHeightPt, contentWidthPt } from './hooks/geometry';
export { isEditableTarget } from './hooks/useSelectionShortcuts';
export type { DesignerProps };
export { bandOf };

export function Designer(props: DesignerProps) {
  // Everything below threads either the wiring result or a raw pass-through
  // prop; the DEFAULTED flags come resolved from the wiring (a default cannot
  // fork).
  const w = useDesignerWiring(props);

  return (
    <div
      className="sj-designer flex min-h-0 flex-1 flex-col bg-bg text-text leading-[1.45]"
      style={w.themeStyle}
    >
      {/* Always present (the menu/replace entries that open it stay codec-gated),
          so a codec-less host carries an inert hidden input, never a live one. */}
      <input
        ref={w.image.fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
        hidden
        onChange={w.image.onFilePicked}
      />
      <TopChrome
        editor={w.editor}
        documentName={props.documentName}
        saveStatus={props.saveStatus}
        menuActions={props.menuActions}
        hostMenuEntries={props.hostMenuEntries}
        maxBytes={w.cap.maxBytes}
        insertGroups={w.inserts.insertGroups}
        prefs={w.prefs}
        sample={w.sample}
        image={w.image}
        inserts={w.inserts}
        blocks={w.blocks}
        selectionOps={w.selectionOps}
        multi={w.multi}
        copilot={w.copilot}
        save={w.save}
        tutorial={w.tutorial}
        views={w.views}
        pdf={w.pdf}
        derived={w.derived}
        session={w.session}
        host={w.host}
        dialogs={w.dialogs}
      />
      <EditorBody
        editor={w.editor}
        views={w.views}
        prefs={w.prefs}
        defs={w.defs}
        sample={w.sample}
        derived={w.derived}
        multi={w.multi}
        nav={w.nav}
        drag={w.drag}
        image={w.image}
        inline={w.inline}
        marks={w.marks}
        pdf={w.pdf}
        inserts={w.inserts}
        selectionOps={w.selectionOps}
        uiEvent={w.tutorial.uiEvent}
        session={w.session}
        host={w.host}
        dialogs={w.dialogs}
        onParamsChange={w.handleParamsChange}
      />
      <div data-tour={TOUR_ANCHORS.diagnostics}>
        <DiagnosticsPanel
          diagnostics={w.diagnostics}
          advisories={w.advisories}
          onSelect={w.editor.select}
          read={w.editor.read}
          onApplyFix={w.applyDiagnosticFix}
        />
      </div>
      <DialogHost
        editor={w.editor}
        inserts={w.inserts}
        defs={w.defs}
        sample={w.sample}
        blocks={w.blocks}
        selectionOps={w.selectionOps}
        tutorial={w.tutorial}
        save={w.save}
        copilot={w.copilot}
        pdf={w.pdf}
        host={w.host}
        onDownloadPdf={props.menuActions?.onDownloadPdf}
        dialogs={w.dialogs}
      />
    </div>
  );
}
