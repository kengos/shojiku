// One row-condition rule as the LIST shows it — Google Sheets' conditional-format
// sidebar row: a drag grip, the rule's sentence ("when <field> is <value>"), the
// chips of what it adds, move up/down, and a remove button. Pressing the row
// opens the rule's own view (`RuleControls`) in place of the list.
//
// The card knows only its DISPLAY position (the list is shown reversed, see
// `ruleOrder.ts`): "up" is toward the top, the rule that wins.

import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { IconChevronDown, IconChevronUp, IconGrip, IconTrash } from '../ui/icons';
import type { PickerOption } from './pickerModel';
import type { RowConditionRow } from './rowConditionsModel';
import { MAX_ROW_CONDITIONS } from './ruleOrder';
import { StyleChips } from './ruleStyleChips';
import { ruleSummary } from './ruleSummary';
import type { RuleDrag } from './useRuleDrag';

export interface RuleCardProps {
  readonly rule: RowConditionRow;
  readonly picked: PickerOption | undefined;
  /** Where the card sits: its display position among `count`, whether the
   * engine applies it at all, and whether the drop line paints above / below. */
  readonly place: {
    readonly display: number;
    readonly count: number;
    readonly applied: boolean;
    readonly line: 'before' | 'after' | null;
  };
  readonly actions: {
    readonly onOpen: () => void;
    readonly onRemove: () => void;
    /** -1 = up (toward the top), +1 = down. */
    readonly onMove: (step: -1 | 1) => void;
  };
  readonly drag: Omit<RuleDrag, 'lineAt'>;
}

const DROP_LINE = 'pointer-events-none absolute right-0 left-0 h-0.5 rounded-full bg-accent';

export function RuleCard({ rule, picked, place, actions, drag }: RuleCardProps) {
  const { t } = useI18n();
  const { display, count } = place;
  // A lone rule has nowhere to go, so it carries no grip and no move buttons
  // (the precedence note under the list appears at the same count).
  const movable = count > 1;
  return (
    <li
      ref={(el) => drag.setRef(display, el)}
      className="relative rounded-md border border-border bg-surface"
    >
      {place.line === 'before' ? (
        <span data-drop="before" className={`${DROP_LINE} -top-1`} />
      ) : null}
      <div className={`flex items-center gap-1 py-1.5 pr-1 ${movable ? 'pl-0.5' : 'pl-2'}`}>
        {movable ? (
          // A pointer-only grip (hidden from assistive tech): the keyboard path
          // is the move up/down buttons beside it.
          <span
            aria-hidden="true"
            data-grip=""
            className="flex cursor-grab touch-none select-none px-0.5 text-muted active:cursor-grabbing"
            onPointerDown={drag.onPointerDown(display)}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerCancel}
          >
            <IconGrip size={14} />
          </span>
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-sm text-text"
          onClick={actions.onOpen}
        >
          {ruleSummary(t, rule, picked)}
        </button>
        {movable ? (
          <>
            <IconButton
              label={t('panel.rowConditions.moveUp')}
              className="min-h-7 min-w-7 p-1"
              data-move="up"
              disabled={display === 0}
              onClick={() => actions.onMove(-1)}
            >
              <IconChevronUp size={14} />
            </IconButton>
            <IconButton
              label={t('panel.rowConditions.moveDown')}
              className="min-h-7 min-w-7 p-1"
              data-move="down"
              disabled={display === count - 1}
              onClick={() => actions.onMove(1)}
            >
              <IconChevronDown size={14} />
            </IconButton>
          </>
        ) : null}
        <IconButton
          label={t('panel.rowConditions.remove')}
          className="min-h-7 min-w-7 p-1"
          onClick={actions.onRemove}
        >
          <IconTrash size={14} />
        </IconButton>
      </div>
      <StyleChips rule={rule} />
      {place.applied ? null : (
        <p className="mx-2 mt-0 mb-1.5 text-muted text-xs">
          {t('panel.rowConditions.overCap', { max: MAX_ROW_CONDITIONS })}
        </p>
      )}
      <span className="sr-only">{`${display + 1}`}</span>
      {place.line === 'after' ? (
        <span data-drop="after" className={`${DROP_LINE} -bottom-1`} />
      ) : null}
    </li>
  );
}
