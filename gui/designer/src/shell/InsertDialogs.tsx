// The insert scaffolds' dialogs: the iterable picker, the create-data-field
// modal, the paste importer, and the container picker. Every one is open-flag
// driven from `useInsertActions` — this file only renders them.

import type { DefinitionsOwnership } from '../hooks/useDefinitionsOwnership';
import type { InsertActions } from '../hooks/useInsertActions';
import type { SampleData } from '../hooks/useSampleData';
import { useI18n } from '../i18n/context';
import { ContainerPickerDialog } from '../insert/ContainerPickerDialog';
import { resolveContainerInsert } from '../insert/containerInsert';
import { FieldDialog } from '../insert/FieldDialog';
import { IterableDialog } from '../insert/IterableDialog';
import { arrayGroups } from '../insert/iterableModel';
import { PasteDialog } from '../insert/PasteDialog';

export interface InsertDialogsProps {
  readonly inserts: InsertActions;
  readonly defs: DefinitionsOwnership;
  readonly sample: SampleData;
  readonly read: (path: string) => unknown;
  readonly selection: string | null;
}

export function InsertDialogs({ inserts, defs, sample, read, selection }: InsertDialogsProps) {
  const { t } = useI18n();
  return (
    <>
      {inserts.iterableOpen ? (
        <IterableDialog
          groups={arrayGroups(defs.paletteGroups)}
          workshop={sample.workshop}
          onConfirm={inserts.handleIterableConfirm}
          onClose={() => inserts.setIterableOpen(false)}
        />
      ) : null}
      {inserts.fieldOpen ? (
        <FieldDialog
          onConfirm={inserts.handleFieldConfirm}
          onClose={() => inserts.setFieldOpen(false)}
        />
      ) : null}
      {inserts.pasteOpen ? (
        <PasteDialog
          onConfirm={inserts.handlePasteConfirm}
          onClose={() => inserts.setPasteOpen(false)}
        />
      ) : null}
      <ContainerPickerDialog
        open={inserts.containerPickerOpen}
        onClose={() => inserts.setContainerPickerOpen(false)}
        onPick={inserts.handleContainerPick}
        nestHint={
          inserts.containerPickerOpen &&
          resolveContainerInsert(read, selection, t('insert.defaultText')).mode === 'nest'
            ? t('containerPicker.nestHint')
            : undefined
        }
      />
    </>
  );
}
