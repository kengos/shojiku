// 「表示形式の絞り込み」 — a field's declared display variants
// (`displayFormats`), behind a disclosure button (the `AdvancedStyles` idiom) that
// starts CLOSED: most fields never
// need one. An empty list restricts nothing; a non-empty one makes a placement
// picking a format outside it (and outside the document's named formats, the
// money formats on an amount, and a few others such as a type name) warn in
// Diagnostics — the hint says so. Rows edit as one op each over the
// whole list (`displayFormatsModel.ts`); a list this editor cannot write back as
// found is a note, never rewritten. Reorder is a grip drag or a row's up / down
// button, both only at two or more rows; after a button move the focus follows
// the row.

import type { Op } from '@shojiku/designer-core';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { IconChevronDown } from '../ui/icons';
import { DisplayFormatAdd } from './DisplayFormatAdd';
import { DisplayFormatRow } from './DisplayFormatRow';
import {
  FORMATS_MAX_BARE,
  FORMATS_MAX_LABELED,
  type FormatsEdit,
  moveFormat,
  readFormats,
} from './displayFormatsModel';
import { useRowDrag } from './useEnumDrag';
import { useMoveFocus } from './useMoveFocus';

const LIMITS = { labeled: FORMATS_MAX_LABELED, bare: FORMATS_MAX_BARE };
const HINT = {
  currency: 'data.formats.hintCurrency',
  number: 'data.formats.hintNumber',
  none: 'data.formats.hint',
} as const;

export interface DisplayFormatsListProps {
  readonly definitions: string;
  readonly keysPath: readonly string[];
  /** The spellings the engine offers for the field's type (suggestions). */
  readonly spellings: readonly string[];
  /** Which money formats also pass without a warning, named in the hint: the
   * three on a currency field, the two that promote a plain number. */
  readonly money: 'currency' | 'number' | null;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => boolean;
}

export function DisplayFormatsList(props: DisplayFormatsListProps) {
  const { definitions, keysPath, spellings, money, editable, onDefEdit } = props;
  const { t } = useI18n();
  const list = useId();
  const bodyId = useId();
  // Starts closed: most fields never need a list (the section's header says so).
  const [open, setOpen] = useState(false);
  const read = readFormats(definitions, keysPath);
  const rows = read.kind === 'rows' ? read.rows : [];
  const target = { keysPath, rows };
  const drag = useRowDrag((from, slot) => moveFormat(target, from, slot), onDefEdit);
  const { listRef, moved } = useMoveFocus();
  const apply = (edit: FormatsEdit) => {
    if (!edit.ok) {
      return t(`data.formats.refusal.${edit.refusal}`, LIMITS);
    }
    onDefEdit(edit.op);
    return null;
  };
  const move = (index: number, step: -1 | 1) => {
    onDefEdit(moveFormat(target, index, step === -1 ? index - 1 : index + 2));
    moved(index, step);
  };
  const count = read.kind === 'rows' ? rows.length : read.count;
  if (count === 0 && !editable) {
    return null;
  }
  const registry = t('formats.registryTitle');
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        // No preflight: a bare button keeps the browser's face (AdvancedStyles).
        className="flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-sm text-muted"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        {/* The section heading's chevron idiom: one glyph, a quarter turn when closed. */}
        <IconChevronDown
          size={12}
          data-collapsed={open ? undefined : ''}
          className="transition-transform data-collapsed:-rotate-90"
        />
        {count === 0 ? t('data.formats.titleNone') : t('data.formats.title', { count })}
      </button>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-1.5">
          <p className="m-0 text-sm text-muted">
            {t(HINT[money ?? 'none'], {
              registry,
              default: t('format.variant.default'),
              symbol: t('format.label.symbol'),
              name: t('format.label.name'),
            })}
          </p>
          {read.kind === 'readonly' ? (
            <p className="m-0 rounded bg-warn-bg px-1.5 py-0.5 text-sm text-warn-text">
              {t(`data.formats.readonly.${read.reason}`, LIMITS)}
            </p>
          ) : (
            <>
              {rows.length > 0 ? (
                <div
                  aria-hidden="true"
                  className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1 pl-5 text-xs text-muted"
                >
                  <span />
                  <span>{t('data.formats.id')}</span>
                  <span>{t('data.formats.label')}</span>
                </div>
              ) : null}
              <ul ref={listRef} className="m-0 flex list-none flex-col gap-1 p-0">
                {rows.map((row, index) => (
                  <DisplayFormatRow
                    // Ids are unique within a list, so the id is the row's identity.
                    key={row.id}
                    target={target}
                    index={index}
                    editable={editable}
                    movable={editable && rows.length > 1}
                    drag={drag}
                    list={list}
                    apply={apply}
                    onMove={(step) => move(index, step)}
                  />
                ))}
              </ul>
              {editable ? <DisplayFormatAdd apply={apply} target={target} list={list} /> : null}
            </>
          )}
          <datalist id={list}>
            {spellings.map((spelling) => (
              <option key={spelling} value={spelling} />
            ))}
          </datalist>
        </div>
      ) : null}
    </div>
  );
}
