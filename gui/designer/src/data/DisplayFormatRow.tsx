// One row of a field's declared display formats: a pointer-only grip, the
// spelling written in the definitions (with the engine's spellings for the type
// as suggestions), its name, move up / down and remove. The grip and the move
// buttons are there only when the list can move (two or more rows, editable).

import { useI18n } from '../i18n/context';
import { clip } from '../palette/fieldDisplay';
import { IconButton } from '../ui/Button';
import { IconChevronDown, IconChevronUp, IconClose, IconGrip } from '../ui/icons';
import {
  type FormatsEdit,
  type FormatsTarget,
  removeFormat,
  setFormatId,
  setFormatLabel,
} from './displayFormatsModel';
import { RuleInput } from './RuleInput';
import type { RowDrag } from './useEnumDrag';

const DROP_LINE = 'pointer-events-none absolute right-0 left-0 h-0.5 rounded-full bg-accent';
const MOVE_BTN = 'min-h-7 min-w-7 p-1';

export interface DisplayFormatRowProps {
  readonly target: FormatsTarget;
  readonly index: number;
  readonly editable: boolean;
  readonly movable: boolean;
  readonly drag: RowDrag;
  /** The `<datalist>` id of the spellings the engine offers for the type. */
  readonly list: string;
  /** Dispatch an edit's op; the refusal MESSAGE when it was refused. */
  readonly apply: (edit: FormatsEdit) => string | null;
  readonly onMove: (step: -1 | 1) => void;
}

export function DisplayFormatRow(props: DisplayFormatRowProps) {
  const { target, index, editable, movable, drag, list, apply, onMove } = props;
  const { t } = useI18n();
  const row = target.rows[index];
  // A hand-written id can be any length; the accessible names carry it clipped.
  const name = clip(row.id);
  const last = index === target.rows.length - 1;
  return (
    <li
      ref={(el) => drag.setRef(index, el)}
      className="relative grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-1"
    >
      {drag.lineAt === index ? (
        <span data-drop="before" className={`${DROP_LINE} -top-0.5`} />
      ) : null}
      {movable ? (
        // Pointer-only (hidden from assistive tech): the keyboard path is the
        // move up / down buttons.
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
        <RuleInput
          label={t('data.formats.idOf', { id: name })}
          value={row.id}
          editable={editable}
          list={list}
          className="font-mono"
          onCommit={(raw) => apply(setFormatId(target, index, raw))}
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <RuleInput
          label={t('data.formats.labelOf', { id: name })}
          value={row.label}
          editable={editable}
          placeholder={t('data.none')}
          onCommit={(raw) => apply(setFormatLabel(target, index, raw))}
        />
      </span>
      {editable ? (
        <span className="flex items-center">
          {movable ? (
            <>
              <IconButton
                label={t('data.formats.moveUp', { id: name })}
                className={MOVE_BTN}
                data-move="up"
                disabled={index === 0}
                onClick={() => onMove(-1)}
              >
                <IconChevronUp size={14} />
              </IconButton>
              <IconButton
                label={t('data.formats.moveDown', { id: name })}
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
            label={t('data.formats.remove', { id: name })}
            className={MOVE_BTN}
            onClick={() => apply(removeFormat(target, index))}
          >
            <IconClose size={14} />
          </IconButton>
        </span>
      ) : (
        <span />
      )}
      {last && drag.lineAt === target.rows.length ? (
        <span data-drop="after" className={`${DROP_LINE} -bottom-0.5`} />
      ) : null}
    </li>
  );
}
