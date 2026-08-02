// The opened document's action handlers, built over the working copy and the
// persistence concerns around it. A pure factory (no hooks), so the composer
// keeps every hook call — and therefore every effect — in its own order.

import { buildSampleSet, type Op, restoreSampleSet, type SampleSet } from '@shojiku/designer';
import { buildKit } from '../fonts/kit';
import type { InstalledFont } from '../fonts/library';
import { buildExport, buildPdfExport, openText } from '../persistence/files';
import type { Snapshot } from '../persistence/snapshotEntry';
import type { DraftOver } from './draftSave';
import type { EditorScreenProps } from './editorProps';
import { sampleEdited } from './sampleEdited';
import type { FontInstall } from './useFontInstall';
import type { HostSave } from './useHostSave';
import type { WorkingCopy } from './useWorkingCopy';

export interface EditorActionsContext {
  readonly props: EditorScreenProps;
  readonly doc: WorkingCopy;
  readonly save: HostSave;
  readonly fonts: FontInstall;
  /** The picked-font list, read at CALL time: a pick and a restore persist
   * after their async install settles, so a render-time snapshot would export
   * the old list. */
  readonly listFonts: () => readonly InstalledFont[];
  readonly persistDraft: (over?: DraftOver) => void;
  readonly effectiveName: string | undefined;
}

export interface EditorActions {
  readonly handleSampleSetChange: (next: SampleSet) => void;
  readonly handleDefinitionsChange: (next: string, edits?: readonly Op[]) => void;
  readonly handleChange: (text: string) => void;
  readonly handleRename: (raw: string) => void;
  readonly handleExport: () => void;
  readonly handleOpen: () => Promise<void>;
  readonly handleDownloadPdf: (pdf: Uint8Array) => void;
  readonly restoreSnapshot: (snapshot: Snapshot) => void;
}

export function buildEditorActions(ctx: EditorActionsContext): EditorActions {
  const { props, doc, save, fonts, listFonts, persistDraft, effectiveName } = ctx;
  const { services, files, docKey, engineLocale, prep, saveTarget, documentName } = props;

  // Sample-data mutations (standalone): the Designer reports the whole variant
  // set (edit / switch / add / delete); mirror it for export/draft and re-save
  // the working copy. The effective definitions the Designer reports (the
  // workshop mode stub, or the engineer file with edits folded in) ride the same
  // draft + export TOGETHER WITH the edit ops behind them — the ops are what a
  // restored session re-applies over the live base.
  const handleSampleSetChange = (next: SampleSet) => {
    doc.setSampleSet(next);
    persistDraft({ sample: next });
  };
  const handleDefinitionsChange = (next: string, edits?: readonly Op[]) => {
    doc.setStubDefinitions(next);
    doc.setDefsEdits(edits);
    persistDraft({ definitions: next, definitionsEdits: edits });
  };

  const handleChange = (text: string) => {
    save.noteEdit();
    doc.setCurrentText(text);
    persistDraft({ text });
  };

  // Commit a header rename. The incoming value is already trimmed + clipped by
  // the header. STANDALONE collapses a commit of the default name to "no
  // override" (the title keeps following the UI locale); MOUNTED keeps the name
  // EXPLICIT — entry names are host strings, and a rename back to the opened
  // entry name must still reach a name-honoring host (sending no name would
  // leave the host on the previous rename, diverging from the header).
  // Standalone persists to the local draft; mounted also writes a
  // crash-recovery draft and persists to the host immediately (a conflict /
  // failure keeps the draft, so the rename survives).
  const handleRename = (raw: string) => {
    const next = saveTarget === undefined && raw === documentName ? undefined : raw;
    if (next === doc.customName) {
      return;
    }
    doc.setCustomName(next);
    persistDraft({ name: next });
    if (saveTarget !== undefined) {
      save.saveToHost(saveTarget, doc.currentText, next);
    }
  };

  const handleExport = () => {
    services.exportFile(
      buildKit({
        presetId: docKey,
        text: doc.currentText,
        // The CURRENT sample-variant set travels; a kit is produced whenever any
        // variant differs from the preset's originals (or a user variant was
        // added), a stub exists, or fonts were picked.
        sampleSet: doc.sampleSet,
        sampleEdited: sampleEdited(doc.sampleSet, {
          params: files.params,
          variants: files.variants,
        }),
        definitions: doc.stubDefinitions,
        fonts: listFonts(),
        overlay: prep.fonts?.exportOverlay() ?? '',
        localeId: engineLocale,
        plain: buildExport,
      }),
    );
  };

  const handleOpen = async () => {
    doc.setOpenError(false);
    const file = await services.openFile();
    if (file === null) {
      return;
    }
    try {
      const text = await openText(file);
      doc.setSeedText(text);
      doc.setCurrentText(text);
      doc.bumpNonce();
    } catch {
      doc.setOpenError(true);
    }
  };

  // The rendered PDF goes out through the SAME host download seam as the YAML
  // export; the Designer produces the bytes (engine) and never writes a file.
  const handleDownloadPdf = (pdf: Uint8Array) => {
    // A lean host may pass no document name at all; the stem guard's own
    // empty-name fallback then names the file.
    services.exportFile(buildPdfExport(effectiveName ?? '', pdf));
  };

  // Restore a point IN PLACE: rebuild the sample set (merging any preset variant
  // added since), reseed the Designer's text (+ keep the live definition edits
  // through the remount) and replace the picked-font set. The reload is async, so
  // the restored draft is persisted only after the fonts settle (else it would
  // save the OLD font list beside the new text/sample). Definitions are untouched
  // — a point never captured them.
  const restoreSnapshot = (snapshot: Snapshot) => {
    const nextSample =
      snapshot.sample !== undefined
        ? restoreSampleSet(snapshot.sample, files.variants)
        : buildSampleSet(files.params, files.variants);
    // Any stale save acknowledgement is about the pre-restore text.
    save.noteEdit();
    doc.setSampleSet(nextSample);
    doc.setSeedDefsEdits(doc.defsEdits);
    doc.setSeedText(snapshot.text);
    doc.setCurrentText(snapshot.text);
    doc.bumpNonce();
    fonts.restoreFonts(snapshot.fonts, () =>
      persistDraft({ text: snapshot.text, sample: nextSample }),
    );
  };

  return {
    handleSampleSetChange,
    handleDefinitionsChange,
    handleChange,
    handleRename,
    handleExport,
    handleOpen,
    handleDownloadPdf,
    restoreSnapshot,
  };
}
