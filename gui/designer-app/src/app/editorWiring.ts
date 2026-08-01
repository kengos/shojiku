// The editor screen's composer: it owns the document's working copy and wires
// four concerns around it — the draft envelope (`draftSave.ts`), explicit save
// + the 409 wire (`useHostSave`), the lazy/picked font flow (`useFontInstall`),
// and restore points (`useSnapshots`) — plus the action handlers over them.
// `EditorScreen.tsx` owns only the render tree it threads the result into.
//
// Effect order is load-bearing and matches what it was before the concerns were
// extracted: the synth load stays FIRST (`useSynthLoad`), `useFontInstall` (the
// draft-font restore, then the loader-status subscription) comes next, and the
// rename-ref refresh + the header report stay LAST (`useHeaderReport`).

import type { InstalledFont } from '../fonts/library';
import { type DraftContext, type DraftOver, saveDraft } from './draftSave';
import { buildEditorActions, type EditorActions } from './editorActions';
import type { EditorScreenProps } from './editorProps';
import type { FontInstall } from './useFontInstall';
import { useFontInstall } from './useFontInstall';
import { useHeaderReport } from './useHeaderReport';
import type { HostSave } from './useHostSave';
import { useHostSave } from './useHostSave';
import { useSnapshots } from './useSnapshots';
import type { SynthLoad } from './useSynthLoad';
import { useSynthLoad } from './useSynthLoad';
import type { WorkingCopy } from './useWorkingCopy';
import { useWorkingCopy } from './useWorkingCopy';

export interface EditorWiring {
  readonly doc: WorkingCopy;
  readonly synth: SynthLoad;
  readonly fonts: FontInstall;
  readonly save: HostSave;
  readonly actions: EditorActions;
  readonly snapshots: ReturnType<typeof useSnapshots>;
  readonly menuActions: {
    readonly onBack: () => void;
    readonly onOpen: () => Promise<void>;
    readonly onExport: () => void;
    readonly onDownloadPdf: (pdf: Uint8Array) => void;
    readonly onAddFont: (() => void) | undefined;
    readonly onSnapshots: () => void;
  };
  /** The sample data is editable in standalone and read-only on a mounted host
   * (engineer-owned, single). A mounted host is detected by the presence of a
   * `saveTarget` — the same signal that routes explicit template saves. */
  readonly sampleDataReadOnly: boolean;
  /** Definitions are host-persisted (mounted) → PROJECT-scoped: a save reaches
   * every template in the project. The wire's presence is the signal. */
  readonly definitionsProjectScoped: boolean;
}

const NO_FONTS: readonly InstalledFont[] = [];

export function useEditorWiring(props: EditorScreenProps): EditorWiring {
  const { services, docKey, files, prep, saveTarget, engineLocale, documentName } = props;
  const { drafts } = services;

  const doc = useWorkingCopy({
    services,
    files,
    initialText: props.initialText,
    initialSample: props.initialSample,
    initialDefinitions: props.initialDefinitions,
    initialDefinitionsEdits: props.initialDefinitionsEdits,
    initialRev: props.initialRev,
    initialCustomName: props.initialCustomName,
  });
  const synth = useSynthLoad(services, engineLocale);

  const listFonts = () => prep.fonts?.list() ?? [];
  // The live working copy every persistence path builds its envelope from.
  // `fonts` is an accessor: a pick and a restore persist AFTER their async
  // install settles, so a render-time snapshot would save the old list.
  const draft: DraftContext = {
    drafts,
    docKey,
    files,
    currentText: doc.currentText,
    sampleSet: doc.sampleSet,
    definitions: doc.stubDefinitions,
    definitionsEdits: doc.defsEdits,
    customName: doc.customName,
    fonts: listFonts,
    rev: doc.rev,
  };
  const persistDraft = (over: DraftOver = {}) => saveDraft(draft, over);

  const fonts = useFontInstall({
    prep,
    initialFonts: props.initialFonts ?? NO_FONTS,
    loadFontCatalog: services.loadFontCatalog,
    onPicked: () => persistDraft(),
  });
  const save = useHostSave({
    draft,
    saveTarget,
    definitionsTarget: props.definitionsTarget,
    projectId: props.projectId,
    initialDefinitionsRev: props.initialDefinitionsRev,
    baseDefinitions: files.definitions,
    definitions: doc.stubDefinitions,
    fonts: listFonts,
    rev: doc.rev,
    setRev: doc.setRev,
  });

  const effectiveName = doc.customName ?? documentName;
  const actions = buildEditorActions({
    props,
    doc,
    save,
    fonts,
    listFonts,
    persistDraft,
    effectiveName,
  });

  const snapshots = useSnapshots({
    snapshots: services.snapshots,
    docKey,
    now: services.now,
    currentText: doc.currentText,
    sampleSet: doc.sampleSet,
    fonts: listFonts,
    onRestore: actions.restoreSnapshot,
  });

  // The file actions move into the Designer's File menu via the typed
  // host-injection seam (add-font appears only when a picker exists — the same
  // gate that showed its button).
  const picker = fonts.picker;
  const menuActions = {
    onBack: props.onBack,
    onOpen: actions.handleOpen,
    onExport: actions.handleExport,
    onDownloadPdf: actions.handleDownloadPdf,
    onAddFont: picker !== null ? () => fonts.openPicker(picker.loadCatalog) : undefined,
    onSnapshots: snapshots.openDialog,
  };

  useHeaderReport({
    effectiveName,
    titleSaveStatus: save.titleSaveStatus,
    onRename: actions.handleRename,
    onHeaderDocChange: props.onHeaderDocChange,
  });

  return {
    doc,
    synth,
    fonts,
    save,
    actions,
    snapshots,
    menuActions,
    sampleDataReadOnly: saveTarget !== undefined,
    definitionsProjectScoped: props.definitionsTarget !== undefined,
  };
}
