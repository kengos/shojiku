// The editor screen for one opened document (a preset in standalone, a project
// template on a mounted host). Mounted per document (the host component keys
// it), so its engine prep is constant for the mount.
//
// This file is the RENDER TREE: `useEditorWiring` owns the working copy, the
// persistence concerns and the hook-call order; here the status strip
// (`EditorBanners`), the font picker, the restore-point dialog and the embedded
// `Designer` read the result.

import { activeText, Designer, EngineProvider } from '@shojiku/designer';
import { FontPicker } from '../fonts/FontPicker';
import { EditorBanners } from './EditorBanners';
import type { EditorScreenProps } from './editorProps';
import { useEditorWiring } from './editorWiring';
import { SnapshotDialog } from './SnapshotDialog';

export type { EditorScreenProps } from './editorProps';

export function EditorScreen(props: EditorScreenProps) {
  const { services, files, prep, engineLocale, colorScheme = 'light' } = props;
  const w = useEditorWiring(props);
  const { doc, fonts, snapshots } = w;
  const picker = fonts.picker;

  return (
    <>
      <EditorBanners
        openError={doc.openError}
        fontStatus={fonts.fontStatus}
        installStatus={fonts.installStatus}
        synthError={w.synth.synthError}
        saveState={w.save.saveState}
      />
      {fonts.pickerOpen && fonts.fontCatalog !== null && picker !== null ? (
        <FontPicker
          catalog={fonts.fontCatalog}
          specimen={services.specimen}
          busy={fonts.installStatus === 'installing'}
          installedPackIds={fonts.familyIds}
          onPick={(family) => fonts.handlePick(picker.controller, family)}
          onClose={fonts.closePicker}
        />
      ) : null}
      <SnapshotDialog
        open={snapshots.open}
        onClose={snapshots.close}
        snapshots={snapshots.list}
        now={snapshots.now}
        busy={snapshots.busy}
        error={snapshots.error}
        onCapture={snapshots.capture}
        onRestore={snapshots.restore}
        onDelete={snapshots.remove}
      />
      <EngineProvider transport={fonts.transport}>
        <Designer
          key={doc.nonce}
          source={doc.seedText}
          params={activeText(doc.sampleSet)}
          sampleSet={doc.sampleSet}
          // The Designer's definitions BASE is always the CANONICAL engineer
          // file (or absent, blank-start = workshop mode). A restored draft's
          // edits come back as OPS (`initialDefinitionsEdits`) and re-apply
          // over that live base — passing the restored TEXT here instead once
          // flipped a reopened blank-start draft out of workshop mode entirely
          // (create-field flows gone, stub re-inference frozen).
          definitions={files.definitions}
          initialDefinitionsEdits={doc.seedDefsEdits}
          engineLocale={engineLocale}
          sampleDataReadOnly={w.sampleDataReadOnly}
          definitionsProjectScoped={w.definitionsProjectScoped}
          synth={w.synth.synth}
          fontFamilies={fonts.offeredFamilies}
          defaultFontFamily={prep.defaultFamily}
          colorScheme={colorScheme}
          defaultGridStep={services.gridStep()}
          onGridStepChange={services.persistGridStep}
          defaultSidebarWidth={services.sidebarWidth()}
          onSidebarWidthChange={services.persistSidebarWidth}
          tutorialStore={services.tutorialStore}
          templateMaxBytes={services.templateMaxBytes()}
          onTemplateMaxBytesChange={services.persistTemplateMaxBytes}
          imageCodec={services.imageCodec}
          onChange={w.actions.handleChange}
          onSampleSetChange={w.actions.handleSampleSetChange}
          onDefinitionsChange={w.actions.handleDefinitionsChange}
          onSave={w.save.handleSave}
          capabilities={prep.capabilities}
          menuActions={w.menuActions}
          hostMenuEntries={services.hostMenuEntries}
          blocks={doc.blocks}
          onBlocksChange={doc.handleBlocksChange}
          copilot={services.copilot}
        />
      </EngineProvider>
    </>
  );
}
