// An item's `visible:` presence binding — "show this only when the data says
// so". It sits ABOVE the content/decoration/placement tabs rather than inside
// one, because it applies to EVERY item type and is none of those three
// concerns: it decides whether the item is there at all.
//
// That placement is also what gives `page_break` an editing surface. A break
// carries nothing but `id` otherwise, so the panel used to tell the user
// there was nothing to edit — while a CONDITIONAL page break is one of the
// reasons this key exists.
//
// The section never evaluates the predicate itself: whether the item shows
// under the current sample data is the engine's answer, arriving as the
// canvas preview and the ghosted overlay, not a second implementation in TS.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM, SECTION_TITLE } from '../ui/chrome';
import { FieldPicker } from './FieldPicker';
import { applyPanelOp } from './model';
import type { PickerOption } from './pickerModel';
import { ValueControl } from './ruleInputs';
import { readVisible, valueFormFor } from './visibilityModel';
import {
  addVisibleOp,
  removeVisibleOp,
  repointVisibleOps,
  setCollapseOp,
  setVisibleEqualsOp,
} from './visibilityOps';

export interface VisibilitySectionProps {
  /** The selected item's structural path. */
  readonly path: string;
  readonly controller: EditorController;
  /** The fields in the item's own data scope — the bound element's inside a
   * `repeat` cell, the top level otherwise. */
  readonly options: readonly PickerOption[];
  /** The selected item's wire `type`. A `page_break` reserves no box, so the
   * engine always removes it when the predicate fails — the collapse choice
   * has nothing to choose between, and the default's explanation would state
   * the OPPOSITE of what happens. */
  readonly itemType: string;
  /** The TOP-LEVEL fields, offered as a labeled second section when the item
   * sits inside a row scope and the engine can author `scope:`. Picking one
   * writes `scope: document` in the same batch — without it the key would
   * resolve against the element and find nothing. */
  readonly documentOptions?: readonly PickerOption[];
}

export function VisibilitySection({
  path,
  controller,
  options,
  documentOptions,
  itemType,
}: VisibilitySectionProps) {
  const { t } = useI18n();
  const row = readVisible(controller.read, path);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);

  if (row === null) {
    return (
      <section className="mb-3">
        <h3 className={SECTION_TITLE}>{t('panel.visible.title')}</h3>
        <p className="mt-0 mb-1.5 text-muted text-sm">{t('panel.visible.hint')}</p>
        <button
          type="button"
          className={`${BTN_SM} w-full text-center`}
          onClick={() => dispatch(addVisibleOp(path))}
        >
          {t('panel.visible.add')}
        </button>
      </section>
    );
  }

  const repoint = (key: string, documentScoped?: boolean) => {
    const all = [...options, ...(documentOptions ?? [])];
    const option = all.find((o) => o.key === key);
    controller.applyAll(
      repointVisibleOps(
        path,
        key,
        option?.type ?? '',
        option?.enumValues ?? [],
        row.hasEquals,
        row.equals,
        documentScoped,
      ),
    );
  };
  const picked = [...options, ...(documentOptions ?? [])].find((o) => o.key === row.key);
  const form = valueFormFor(picked?.type ?? '', picked?.enumValues ?? []);
  return (
    <section className="mb-3">
      <h3 className={SECTION_TITLE}>{t('panel.visible.title')}</h3>
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2">
        <FieldPicker
          label={t('panel.visible.field')}
          value={row.key}
          options={options}
          documentOptions={documentOptions}
          scope={row.documentScope ? 'document' : ''}
          // Repointing can change which controls render (a boolean-form field
          // has no value control), so a stale `equals` is reconciled in the
          // SAME batch — one transactional undo step.
          onCommit={(key) => repoint(key, undefined)}
          // A PICKED row commits with the scope it was offered at. Typing a
          // key never re-scopes: the file's `scope:` stays as authored.
          onPick={documentOptions === undefined ? undefined : repoint}
        />
        <ValueControl
          form={form}
          rule={row}
          options={picked?.enumValues ?? []}
          label={t('panel.visible.value')}
          onChange={(value) => dispatch(setVisibleEqualsOp(path, value, picked?.type ?? ''))}
        />
        {itemType === 'page_break' ? (
          // No checkbox: the engine removes a page_break whose predicate
          // fails whatever `collapse` says, so offering the choice would be a
          // control with no effect — and the default's copy ("keeps its
          // space") would describe the opposite of what happens.
          <p className="m-0 text-muted text-xs">{t('panel.visible.breakNote')}</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={row.collapse}
                onChange={(event) => dispatch(setCollapseOp(path, event.currentTarget.checked))}
              />
              {t('panel.visible.collapse')}
            </label>
            <p className="m-0 text-muted text-xs">
              {row.collapse ? t('panel.visible.collapseOn') : t('panel.visible.collapseOff')}
            </p>
          </>
        )}
        {row.documentScope ? (
          // The panel does not edit `scope:` — it is an authoring-level
          // choice — but silently not showing it would misdescribe the
          // document, so the row says what the wire holds.
          <p className="m-0 text-muted text-xs">{t('panel.visible.documentScope')}</p>
        ) : null}
        <button
          type="button"
          className={`${BTN_SM} w-full text-center`}
          onClick={() => dispatch(removeVisibleOp(path))}
        >
          {t('panel.visible.remove')}
        </button>
      </div>
    </section>
  );
}
