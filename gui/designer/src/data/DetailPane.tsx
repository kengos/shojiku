// The right pane of the data-item editor for ONE selected field: its DEFINITION
// metadata (label / type / format / description) and its SAMPLE value(s).
//
// The pane itself holds no state: every uncontrolled input inside is keyed by
// its OWN value (`def.title`, the sample value), and that is what reseeds them
// when the selection or the document changes — the pane is NOT keyed by the
// selection, so anything added here must carry the same value-key or it will go
// on showing the previous field's text.
//
// A scalar field has one value; an array-group field renders one value per row
// (a focused column view) plus add/remove-row. Definition inputs are read-only
// when the host did not arm definition editing; sample inputs are read-only on a
// mounted host, and the two are independent.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import type { PaletteField, PaletteGroup } from '../palette/model';
import type { SampleKind, SamplePath } from '../sample/model';
import { BTN_SM, SECTION_TITLE } from '../ui/chrome';
import { DefinitionForm } from './DefinitionForm';
import { fieldKeysPath, readDefinitionField } from './definitionsEdit';
import { arrayLength, readAt, sampleKind } from './editorModel';
import { ReadonlyValue, ValueField } from './ValueField';

export interface DetailPaneProps {
  readonly group: PaletteGroup;
  readonly field: PaletteField;
  readonly definitions: string;
  readonly params: string;
  readonly editable: boolean;
  readonly canEditSample: boolean;
  readonly engineLocale?: string;
  readonly formatRegistry: readonly string[];
  readonly capabilities?: readonly string[];
  readonly onDefEdit: (op: Op | null) => void;
  readonly onCommitSample: (path: SamplePath, kind: SampleKind, raw: string) => void;
  readonly onAddRow: () => void;
  readonly onRemoveRow: (index: number) => void;
}

/** The right pane for one selected field: its definition metadata + its sample
 * value(s). Stateless — the inputs inside reseed by their own value keys. */
export function DetailPane({
  group,
  field,
  definitions,
  params,
  editable,
  canEditSample,
  engineLocale,
  formatRegistry,
  capabilities,
  onDefEdit,
  onCommitSample,
  onAddRow,
  onRemoveRow,
}: DetailPaneProps) {
  const { t } = useI18n();
  const keysPath = fieldKeysPath(group, field.key);
  const def = readDefinitionField(definitions, keysPath);
  const kind = sampleKind(def.type, def.format);
  const fieldSegs = field.key.split('.');

  // The sample section: a scalar field has ONE value; an array-group field has
  // one value per row (a focused column view) plus add/remove-row.
  let sampleSection: ReactNode;
  if (!group.isArray) {
    const value = readAt(params, fieldSegs);
    sampleSection = canEditSample ? (
      <ValueField
        key={value}
        label={t('data.sampleValue')}
        kind={kind}
        value={value}
        engineLocale={engineLocale}
        options={field.enumOptions}
        onCommit={(raw) => onCommitSample(fieldSegs, kind, raw)}
      />
    ) : (
      <ReadonlyValue value={value} options={field.enumOptions} />
    );
  } else {
    const rows = arrayLength(params, group.id);
    sampleSection = (
      <div className="flex flex-col gap-2">
        {rows === 0 ? <p className="m-0 text-sm text-muted">{t('sample.emptyReadOnly')}</p> : null}
        {Array.from({ length: rows }, (_, index) => {
          const path: SamplePath = [group.id, index, ...fieldSegs];
          const value = readAt(params, path);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: sample rows are a stable order-preserving list with no identity of their own (the index IS the row).
            <fieldset key={`${index}`} className="rounded-md border border-border p-2">
              <legend className="px-1 text-sm text-muted">{`#${index + 1}`}</legend>
              {canEditSample ? (
                <ValueField
                  key={value}
                  label={field.label}
                  kind={kind}
                  value={value}
                  engineLocale={engineLocale}
                  options={field.enumOptions}
                  compact
                  onCommit={(raw) => onCommitSample(path, kind, raw)}
                />
              ) : (
                <ReadonlyValue value={value} options={field.enumOptions} />
              )}
              {canEditSample ? (
                <button type="button" className={BTN_SM} onClick={() => onRemoveRow(index)}>
                  {t('sample.removeRow')}
                </button>
              ) : null}
            </fieldset>
          );
        })}
        {canEditSample ? (
          <button type="button" className={`${BTN_SM} self-start`} onClick={onAddRow}>
            {t('sample.addRow')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <DefinitionForm
        keysPath={keysPath}
        def={def}
        editable={editable}
        formatRegistry={formatRegistry}
        capabilities={capabilities}
        onDefEdit={onDefEdit}
      />
      <section className="flex flex-col gap-2">
        <h3 className={SECTION_TITLE}>{t('data.sampleValue')}</h3>
        {sampleSection}
      </section>
    </>
  );
}
