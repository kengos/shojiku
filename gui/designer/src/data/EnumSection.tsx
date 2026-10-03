// 選択肢 — a field's (or a list element's) declared value set, `enum`: the
// 「値を選択肢で決める」 toggle, the member table, the add row, and the notices
// that say what the engine will do with it.
//
// What the toggle writes is `EnumToggle`'s. A list this editor cannot write back
// as found is shown as a note and never rewritten (turning it off, which writes
// no list, stays possible). Choices are not offered on a yes / no field (the set
// is already closed and labels never print there) unless one was authored. An
// edit the HOST refuses (its edit-list cap) keeps the entry, with the reason.
//
// Local state (the open draft, the confirm) belongs to ONE node: the caller keys
// this section by the node, since the detail pane is not keyed by selection.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, SECTION_TITLE } from '../ui/chrome';
import { MAX_DEFS_EDITS } from './defsPlan';
import { EnumAddRow } from './EnumAddRow';
import { EnumNotices } from './EnumNotices';
import { EnumRows } from './EnumRows';
import { EnumToggle } from './EnumToggle';
import { TYPE_OPTION_KEY } from './editorModel';
import {
  ENUM_MAX_BARE,
  ENUM_MAX_LABELED,
  type EnumEdit,
  type EnumRefusal,
  readEnum,
} from './enumModel';
import { engineFieldType } from './enumRules';

const LIMITS = { bare: ENUM_MAX_BARE, labeled: ENUM_MAX_LABELED };

export interface EnumSectionProps {
  readonly definitions: string;
  readonly keysPath: readonly string[];
  /** The field's base type and semantic format, as authored. */
  readonly type: string;
  readonly format: string;
  readonly editable: boolean;
  /** `false` = the host refused the edit (its edit-list cap). */
  readonly onDefEdit: (op: Op | null) => boolean;
  /** A list ELEMENT's choices (inside 「1 つ 1 つの値」) rather than a field's. */
  readonly nested?: boolean;
}

function useEnumRefusal(): (refusal: EnumRefusal) => string {
  const { t } = useI18n();
  return (refusal) => {
    if (refusal === 'full') {
      return t('data.choices.refusal.full', LIMITS);
    }
    return t(
      refusal === 'empty' || refusal === 'duplicate'
        ? `data.choices.refusal.${refusal}`
        : `data.refusal.${refusal}`,
    );
  };
}

export function EnumSection(props: EnumSectionProps) {
  const { definitions, keysPath, type, format, editable, onDefEdit, nested } = props;
  const { t } = useI18n();
  const refusalText = useEnumRefusal();
  const [opened, setOpened] = useState(false);
  const read = readEnum(definitions, keysPath);
  if (read.kind === 'absent' && (!editable || type === 'boolean')) {
    return null;
  }
  const rows = read.kind === 'rows' ? read.rows : [];
  const on = read.kind !== 'absent' || opened;
  const target = { keysPath, type, rows };
  const apply = (edit: EnumEdit) => {
    if (!edit.ok) {
      return refusalText(edit.refusal);
    }
    return onDefEdit(edit.op)
      ? null
      : t('data.error.edit_cap', { edits: MAX_DEFS_EDITS, undo: t('data.undo') });
  };
  let count: number | null = rows.length;
  if (read.kind === 'readonly') {
    count = read.count === 0 ? null : read.count;
  }
  const title = t('data.choices.title');
  // A list prints its values as they are, so its labels never print; a field's
  // print only where it is plain text.
  const labelsPrint = !nested && engineFieldType(type, format) === 'string';
  return (
    <section className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        {nested ? (
          <span className={FIELD_LABEL}>{title}</span>
        ) : (
          <h3 className={SECTION_TITLE}>{title}</h3>
        )}
        <HelpHint
          label={title}
          body={t('data.choices.help', { text: t(TYPE_OPTION_KEY.string) })}
        />
      </span>
      <EnumToggle
        on={on}
        editable={editable}
        present={read.kind !== 'absent'}
        count={count}
        onOpen={setOpened}
        onRemove={() => {
          onDefEdit({ op: 'removeKey', keys: [...keysPath, 'enum'] });
          setOpened(false);
        }}
      />
      {read.kind === 'readonly' ? (
        <p className="m-0 rounded bg-warn-bg px-1.5 py-0.5 text-sm text-warn-text">
          {t(`data.choices.readonly.${read.reason}`, LIMITS)}
        </p>
      ) : null}
      {on && read.kind !== 'readonly' ? (
        <>
          {rows.length > 0 ? (
            <div
              aria-hidden="true"
              className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1 pl-5 text-xs text-muted"
            >
              <span />
              <span>{t('data.choices.value')}</span>
              <span>{t('data.choices.label')}</span>
            </div>
          ) : null}
          <EnumRows target={target} editable={editable} apply={apply} dispatch={onDefEdit} />
          {editable ? (
            <EnumAddRow target={target} apply={apply} startOpen={rows.length === 0} />
          ) : null}
          <EnumNotices
            target={target}
            format={format}
            editable={editable}
            authoredEmpty={read.kind === 'rows' && rows.length === 0}
            list={nested === true}
          />
          <p className="m-0 text-sm text-muted">
            {t('data.choices.note')}
            {labelsPrint ? ` ${t('data.choices.noteLabel')}` : null}
          </p>
        </>
      ) : null}
    </section>
  );
}
