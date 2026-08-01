// The two fullscreen views that replace the editing grid wholesale: the
// document settings page and the data-item editor. Either takes the WHOLE
// editor area — its own section rail replaces the tool pane's navigation, so
// leaving the pane beside it would put two navigation columns on one screen.
//
// Rendered only when one of them is open; `EditorBody` owns that decision and
// the grid it swaps out.

import { DataEditorView } from '../data/DataEditorView';
import { canUndoDefs } from '../data/defsHistory';
import type { EditorController } from '../editor/useEditor';
import type { DefinitionsOwnership } from '../hooks/useDefinitionsOwnership';
import type { DocDerived } from '../hooks/useDocDerived';
import type { DocViews } from '../hooks/useDocViews';
import type { PreviewSession } from '../hooks/usePreviewSession';
import type { SampleData } from '../hooks/useSampleData';
import type { HostConfig } from '../hostConfig';
import { DocumentSettingsPage } from '../panel/DocumentSettingsPage';
import { registryNames } from '../panel/itemView';
import { canUndoSample } from '../sample/history';

export interface FullscreenViewProps {
  readonly editor: EditorController;
  readonly views: DocViews;
  readonly defs: DefinitionsOwnership;
  readonly sample: SampleData;
  readonly derived: DocDerived;
  readonly session: PreviewSession;
  readonly host: HostConfig;
  readonly onParamsChange: (params: string) => void;
}

export function FullscreenView({
  editor,
  views,
  defs,
  sample,
  derived,
  session,
  host,
  onParamsChange,
}: FullscreenViewProps) {
  // Locals, not property reads: narrowing follows a local binding, and the
  // grouped bundles must not be read through inside the JSX.
  const { capabilities, defaultFontFamily, engineLocale, fontFamilies, locale, synth } = host;
  const { docViewOpen, docFocus } = views;
  const { effectiveDefinitions } = defs;

  if (docViewOpen) {
    return (
      <DocumentSettingsPage
        controller={editor}
        fontFamilies={fontFamilies}
        capabilities={capabilities}
        defaultFontFamily={defaultFontFamily}
        styleUsage={derived.styleUsage}
        pages={session.pages}
        focus={docFocus ?? undefined}
        onClose={views.closeDocView}
      />
    );
  }
  return (
    <DataEditorView
      definitions={effectiveDefinitions ?? ''}
      params={sample.params}
      templateText={editor.text}
      onDefinitionEdit={defs.editDefinition}
      onParamsChange={onParamsChange}
      sampleDataReadOnly={host.sampleDataReadOnly}
      definitionsProjectScoped={host.definitionsProjectScoped}
      synth={synth}
      locale={locale}
      engineLocale={engineLocale}
      variants={{
        set: sample.sampleSet,
        onSwitch: sample.handleSwitch,
        onCommit: sample.handleVariantCommit,
      }}
      canUndo={canUndoSample(sample.sampleHistory)}
      onUndo={sample.undoSample}
      canUndoDefinition={canUndoDefs(defs.defsHistory)}
      onUndoDefinition={defs.undoDefinition}
      formatRegistry={registryNames(editor.read('formats'))}
      capabilities={capabilities}
      onClose={views.closeDataView}
    />
  );
}
