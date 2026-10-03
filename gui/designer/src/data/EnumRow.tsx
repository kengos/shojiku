// One member row of the choices table: a pointer-only grip, the data value, the
// printed text, move up / down and remove. The grip and the move buttons are
// there only when the list can move (two or more rows, editable); a member whose
// value is not of the field's type carries a visible mark and `aria-invalid`.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { INPUT } from '../ui/chrome';
import { IconChevronDown, IconChevronUp, IconClose, IconGrip } from '../ui/icons';
import { type EnumTarget, removeRow, setRowLabel, setRowValue } from './enumEdits';
import type { EnumEdit } from './enumModel';
import { memberMismatch } from './enumRules';
import { RuleInput } from './RuleInput';
import type { EnumDrag } from './useEnumDrag';
import { shownScalar } from './valueRules';

const DROP_LINE = 'pointer-events-none absolute right-0 left-0 h-0.5 rounded-full bg-accent';
const MOVE_BTN = 'min-h-7 min-w-7 p-1';

export interface EnumRowProps {
  readonly target: EnumTarget;
  readonly index: number;
  readonly editable: boolean;
  readonly movable: boolean;
  readonly drag: EnumDrag;
  /** Dispatch an edit's op; the refusal MESSAGE when it was refused. */
  readonly apply: (edit: EnumEdit) => string | null;
  readonly onMove: (step: -1 | 1) => void;
}

export function EnumRow({ target, index, editable, movable, drag, apply, onMove }: EnumRowProps) {
  const { t } = useI18n();
  const { rows, type } = target;
  const row = rows[index];
  const name = shownScalar(row.value);
  const mismatch = memberMismatch(type, row.value);
  const last = index === rows.length - 1;
  // The select has no text to keep, so a refused pick (a duplicate) snaps back
  // and says why here.
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <li
      ref={(el) => drag.setRef(index, el)}
      className="relative grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-1"
    >
      {drag.lineAt === index ? (
        <span data-drop="before" className={`${DROP_LINE} -top-0.5`} />
      ) : null}
      {movable ? (
        // A pointer-only grip (hidden from assistive tech): the keyboard path is
        // the move up/down buttons.
        <span
          aria-hidden="true"
          data-grip=""
          className="flex cursor-grab touch-none select-none py-1.5 text-muted active:cursor-grabbing"
          onPointerDown={drag.onPointerDown(index)}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
        >
          <IconGrip size={14} />
        </span>
      ) : (
        <span />
      )}
      <span className="flex min-w-0 flex-col">
        {type === 'boolean' ? (
          <select
            className={INPUT}
            aria-label={t('data.choices.valueOf', { value: name })}
            disabled={!editable}
            value={name}
            onChange={(event) =>
              setRefusal(apply(setRowValue(target, index, event.currentTarget.value)))
            }
          >
            <option value="true">true</option>
            <option value="false">false</option>
            {/* A mistyped member keeps its own option, so the select shows it
                rather than a value the list does not hold. */}
            {mismatch ? <option value={name}>{name}</option> : null}
          </select>
        ) : (
          <RuleInput
            label={t('data.choices.valueOf', { value: name })}
            value={name}
            editable={editable}
            className="font-mono"
            invalid={mismatch}
            onCommit={(raw) => apply(setRowValue(target, index, raw))}
          />
        )}
        {refusal === null ? null : <span className="text-sm text-error-text">{refusal}</span>}
        {mismatch ? (
          <span className="text-xs text-warn-text">{t('data.choices.mismatchMark')}</span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <RuleInput
          label={t('data.choices.labelOf', { value: name })}
          value={row.label}
          editable={editable}
          placeholder={t('data.choices.labelEmpty')}
          onCommit={(raw) => apply(setRowLabel(target, index, raw))}
        />
      </span>
      {editable ? (
        <span className="flex items-center">
          {movable ? (
            <>
              <IconButton
                label={t('data.choices.moveUp', { value: name })}
                className={MOVE_BTN}
                data-move="up"
                disabled={index === 0}
                onClick={() => onMove(-1)}
              >
                <IconChevronUp size={14} />
              </IconButton>
              <IconButton
                label={t('data.choices.moveDown', { value: name })}
                className={MOVE_BTN}
                data-move="down"
                disabled={last}
                onClick={() => onMove(1)}
              >
                <IconChevronDown size={14} />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label={t('data.choices.remove', { value: name })}
            className={MOVE_BTN}
            onClick={() => apply(removeRow(target, index))}
          >
            <IconClose size={14} />
          </IconButton>
        </span>
      ) : (
        <span />
      )}
      {last && drag.lineAt === rows.length ? (
        <span data-drop="after" className={`${DROP_LINE} -bottom-0.5`} />
      ) : null}
    </li>
  );
}
