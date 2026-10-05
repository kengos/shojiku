// The full-screen data-item editor (the document settings mould): it takes over the whole
// editor area, entered by the gear on the data-items tab and the File-menu
// edit-data-items entry. Left = search + the data-item TREE (the root, groups,
// tables, lists and fields at any depth); right = the selected node's DEFINITION
// and, for a field, its SAMPLE value in a roomy editor — the point being a
// novel-length genkoyoshi body text, uneditable in the old one-line sidebar input.
//
// This file is the SHELL: the host-facing props, the selection/derived state,
// the two commit paths (a sample value, a definition op), and the header +
// two-pane composition. The panes themselves are `ItemListPane` (left) and
// `DetailPane` (right, handed ONE `DetailContext`); `SampleControls` carries the
// document-level sample controls and `EditorBand` what the definitions are.
//
// Definitions are EDITABLE here: each edit is a CST-preserving op reported up
// through `onDefinitionEdit`, addressed by the tree node's own keys path, and a
// fresh item is added through `addFieldPlan`. Sample values are `params` edits
// reported through `onParamsChange`, variant-aware and read-only on a mounted
// host (engineer-owned data).

import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { addSampleRow, removeSampleRow } from '../sample/edit';
import { fillMissingParams, missingParamKeys } from '../sample/generate';
import type { SampleKind, SamplePath } from '../sample/model';
import { IconButton } from '../ui/Button';
import { IconClose } from '../ui/icons';
import { DetailPane } from './DetailPane';
import { readDefsTree } from './defsTree';
import type { DetailContext } from './detailContext';
import { EditorBand } from './EditorBand';
import { commitSampleValue } from './editorModel';
import type { DataEditorViewProps } from './editorProps';
import { ItemListPane } from './ItemListPane';
import { readDataRefs } from './refs/walk';
import { SampleControls } from './SampleControls';
import { findNode, nodeForTarget } from './treeModel';
import { useNodeActions } from './useNodeActions';

export function DataEditorView({
  definitions,
  params,
  templateText,
  onDefinitionEdit,
  onParamsChange,
  sampleDataReadOnly = false,
  definitionsProjectScoped = false,
  definitionsInferred = false,
  synth,
  locale = 'en',
  engineLocale,
  variants,
  canUndo = false,
  onUndo,
  canUndoDefinition = false,
  onUndoDefinition,
  undoDefinitionHint,
  restructure,
  initialSelection,
  formatCatalog,
  onClose,
}: DataEditorViewProps) {
  const { t } = useI18n();
  const tree = useMemo(() => readDefsTree(definitions), [definitions]);
  const refs = useMemo(() => readDataRefs(templateText), [templateText]);
  // Seeded once, on mount: the view is unmounted whenever it is not open, so
  // every entry re-runs this. A stale or hostile target resolves to no node and
  // lands on the no-selection surface rather than erroring.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialSelection === undefined || tree === null
      ? null
      : (nodeForTarget(tree, initialSelection)?.id ?? null),
  );
  // Resolved against the CURRENT tree each render, so an edit that keeps the node
  // selected still finds it (null once it no longer exists).
  const selected = tree === null || selectedId === null ? null : findNode(tree, selectedId);

  const canEditSample = !sampleDataReadOnly;
  const missing = onDefinitionEdit === undefined ? [] : missingParamKeys(params, definitions);

  const editable = onDefinitionEdit !== undefined && definitions !== '';

  const { notice, dispatchDefEdit, undo, actions } = useNodeActions({
    tree,
    definitions,
    refs,
    editable,
    projectScoped: definitionsProjectScoped,
    sampleReadOnly: sampleDataReadOnly,
    onDefinitionEdit,
    onUndoDefinition,
    restructure,
    select: setSelectedId,
  });

  const commitSample = (path: SamplePath, kind: SampleKind, raw: string) => {
    const next = commitSampleValue(params, path, kind, raw);
    if (next !== params) {
      onParamsChange(next);
    }
  };

  const detailContext = (root: NonNullable<typeof tree>): DetailContext => ({
    tree: root,
    definitions,
    params,
    editable,
    canEditSample,
    engineLocale,
    onDefEdit: dispatchDefEdit,
    onCommitSample: commitSample,
    onAddRow: (arrayPath: SamplePath) => onParamsChange(addSampleRow(params, arrayPath)),
    onRemoveRow: (arrayPath: SamplePath, index: number) =>
      onParamsChange(removeSampleRow(params, arrayPath, index)),
    onSelect: setSelectedId,
    usage: refs,
    restructure: actions,
    formats: formatCatalog,
  });

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
        {/* Left: search + add + tree. */}
        <ItemListPane
          tree={tree}
          usage={refs?.refs ?? []}
          notice={notice}
          definitions={definitions}
          selected={selected}
          onSelect={setSelectedId}
          edit={{
            onDefinitionEdit: onDefinitionEdit === undefined ? undefined : dispatchDefEdit,
            canUndo: canUndoDefinition,
            onUndo: undo,
            undoHint: undoDefinitionHint,
          }}
        />
        {/* Right: the selected field's definition + sample. */}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto flex max-w-[560px] flex-col gap-6">
            <EditorBand
              projectScoped={definitionsProjectScoped && onDefinitionEdit !== undefined}
              inferred={definitionsInferred}
            />
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
            {tree === null || selected === null ? (
              <p className="m-0 text-muted">{t('data.selectHint')}</p>
            ) : (
              <DetailPane node={selected} ctx={detailContext(tree)} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export type { DataEditorViewProps } from './editorProps';
