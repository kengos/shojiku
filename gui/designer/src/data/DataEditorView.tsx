// The full-screen data-item editor (the document settings mould): it takes over the whole
// editor area, entered by the gear on the data-items tab and the File-menu
// edit-data-items entry. Left = search + the data-item list; right = the
// selected field's DEFINITION (label / type / format / description) AND its
// SAMPLE value in a roomy editor — the point being a novel-length genkoyoshi body text,
// uneditable in the old one-line sidebar input.
//
// This file is the SHELL: the host-facing props, the selection/derived state,
// the two commit paths (a sample value, a definition op), and the header +
// two-pane composition. The panes themselves are `ItemListPane` (left) and
// `DetailPane` (right); `VariantBar` carries the document-level sample
// controls.
//
// Definitions are EDITABLE here (reversing the old read-only seam): each
// metadata edit is a CST-preserving op reported up through `onDefinitionEdit`,
// and a fresh field is added through `addFieldPlan`. Sample values are `params`
// edits reported through `onParamsChange`, variant-aware and read-only on a
// mounted host (engineer-owned data).

import type { Op } from '@shojiku/designer-core';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { readBindings } from '../palette/bindings';
import { readDefinitionsView } from '../palette/model';
import { buildUsage } from '../palette/usage';
import { addSampleField, addSampleRow, removeSampleRow, setSampleValue } from '../sample/edit';
import { fillMissingParams, missingParamKeys } from '../sample/generate';
import { coerceSampleValue, parseParams, type SampleKind, type SamplePath } from '../sample/model';
import { IconButton } from '../ui/Button';
import { IconClose } from '../ui/icons';
import { DetailPane } from './DetailPane';
import { selectionKey } from './editorModel';
import type { DataEditorViewProps } from './editorProps';
import { ItemListPane } from './ItemListPane';
import { SampleControls } from './SampleControls';

export function DataEditorView({
  definitions,
  params,
  templateText,
  onDefinitionEdit,
  onParamsChange,
  sampleDataReadOnly = false,
  definitionsProjectScoped = false,
  synth,
  locale = 'en',
  engineLocale,
  variants,
  canUndo = false,
  onUndo,
  canUndoDefinition = false,
  onUndoDefinition,
  formatRegistry = [],
  capabilities,
  onClose,
}: DataEditorViewProps) {
  const { t } = useI18n();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const groups = useMemo(() => readDefinitionsView(definitions) ?? [], [definitions]);
  const usage = useMemo(() => buildUsage(readBindings(templateText)), [templateText]);

  // Resolve the selection against the CURRENT groups so an edit that keeps the
  // field selected still finds it (null when it no longer exists).
  const selected = useMemo(() => {
    if (selectedKey === null) {
      return null;
    }
    for (const group of groups) {
      for (const field of group.fields) {
        if (selectionKey(group.id, field.key) === selectedKey) {
          return { group, field };
        }
      }
    }
    return null;
  }, [groups, selectedKey]);

  const canEditSample = !sampleDataReadOnly;
  const missing = onDefinitionEdit === undefined ? [] : missingParamKeys(params, definitions);

  const editable = onDefinitionEdit !== undefined && definitions !== '';

  const dispatchDefEdit = (op: Op | null) => {
    if (op !== null && onDefinitionEdit !== undefined) {
      onDefinitionEdit(op);
    }
  };

  // Commit a sample value: a fresh top-level scalar is CREATED (a field added to
  // definitions has no params value yet); an existing leaf is set in place.
  const commitSample = (path: SamplePath, kind: SampleKind, raw: string) => {
    const value = coerceSampleValue(kind, raw);
    const root = parseParams(params);
    if (
      path.length === 1 &&
      typeof path[0] === 'string' &&
      root !== null &&
      !Object.hasOwn(root, path[0])
    ) {
      onParamsChange(addSampleField(params, path[0], value));
      return;
    }
    const next = setSampleValue(params, path, value);
    if (next !== params) {
      onParamsChange(next);
    }
  };

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg"
      aria-label={t('data.editorTitle')}
    >
      <header className="flex min-h-[42px] items-center gap-2 border-b border-border bg-chrome px-3">
        <IconButton label={t('docSettings.close')} variant="ghost" onClick={onClose}>
          <IconClose />
        </IconButton>
        <h2 className="m-0 text-base font-semibold text-text">{t('data.editorTitle')}</h2>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* Left: search + add + list. */}
        <ItemListPane
          groups={groups}
          usage={usage}
          definitions={definitions}
          onDefinitionEdit={onDefinitionEdit}
          canUndoDefinition={canUndoDefinition}
          onUndoDefinition={onUndoDefinition}
          definitionsProjectScoped={definitionsProjectScoped}
          selectedField={selected?.field ?? null}
          onSelect={setSelectedKey}
        />
        {/* Right: the selected field's definition + sample. */}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto flex max-w-[560px] flex-col gap-6">
            <SampleControls
              canEditSample={canEditSample}
              variants={variants}
              canUndo={canUndo}
              onUndo={onUndo}
              showGenerate={editable && missing.length > 0}
              onGenerate={() =>
                onParamsChange(fillMissingParams(params, definitions, synth, locale))
              }
            />
            {selected === null ? (
              <p className="m-0 text-muted">{t('data.selectHint')}</p>
            ) : (
              <DetailPane
                group={selected.group}
                field={selected.field}
                definitions={definitions}
                params={params}
                editable={editable}
                canEditSample={canEditSample}
                engineLocale={engineLocale}
                formatRegistry={formatRegistry}
                capabilities={capabilities}
                onDefEdit={dispatchDefEdit}
                onCommitSample={commitSample}
                onAddRow={() => onParamsChange(addSampleRow(params, [selected.group.id]))}
                onRemoveRow={(index) =>
                  onParamsChange(removeSampleRow(params, [selected.group.id], index))
                }
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export type { DataEditorViewProps } from './editorProps';
