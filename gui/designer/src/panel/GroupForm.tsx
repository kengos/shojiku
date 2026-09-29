// The single-group form a canvas header-group selection (`…headerGroups[n]`)
// opens: the heading label and how many columns it spans — the group identity
// the user just clicked, without hunting the parent table — its format
// (`GroupStyleFields`: the table bands' controls at the group's own `style`, and
// its named styles) and the way to remove it (adding one lives with the table's
// own settings, since there is no group to select before the first exists).

import type { Op } from '@shojiku/designer-core';
import { useId } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { formatList } from '../i18n/format';
import { BTN_SM, INPUT, PANEL, SECTION_TITLE } from '../ui/chrome';
import { readColumnsView } from './columnsModel';
import { Field } from './fields';
import { GroupStyleFields } from './GroupStyleFields';
import { type GroupRow, groupCoverage, spanOp } from './groupModel';
import { applyPanelOp, plainTextOp } from './model';
import { StepperField } from './StepperField';
import { removeHeaderGroupOp } from './tableSettingsOps';

/** Hint-label clip — a spanned-column name is a glance aid, not a viewer. */
const MAX_HINT_LABEL_CHARS = 24;

function clipLabel(label: string): string {
  return label.length > MAX_HINT_LABEL_CHARS ? `${label.slice(0, MAX_HINT_LABEL_CHARS)}…` : label;
}

export interface GroupFormProps {
  readonly controller: EditorController;
  /** The selected group's structural path (`…headerGroups[n]`). */
  readonly path: string;
  /** The owning table's path — the columns the span is measured against. */
  readonly tablePath: string;
  /** The group's index in the authored `headerGroups` list. */
  readonly index: number;
  readonly group: GroupRow;
  readonly groups: readonly GroupRow[];
  /** Move the selection off the group a removal deletes. */
  readonly onSelectPath?: (path: string) => void;
  /** What the format part needs from the host: its font families, the engine's
   * capabilities (the part is gated) and the engine-default floor. */
  readonly host: {
    readonly fontFamilies: readonly string[];
    readonly capabilities?: readonly string[];
    readonly floor?: Readonly<Record<string, unknown>>;
  };
}

export function GroupForm({
  controller,
  path,
  tablePath,
  index,
  group,
  groups,
  onSelectPath,
  host,
}: GroupFormProps) {
  const { t, locale } = useI18n();
  const columns = readColumnsView(controller.read(tablePath)) ?? [];
  const coverage = groupCoverage(groups, columns.length, index);
  const coveredSpan = coverage === null ? 0 : coverage.span;
  // The impact scope of a span edit, named: which columns this group actually
  // sits over (the engine's own accumulation), so the user sees what a change
  // moves before making it rather than by reading the canvas afterwards.
  // Labels are clipped — the hint is a glance aid, and a hostile document's
  // labels are unbounded (the layer tree clips its rows the same way).
  const covered = coverage
    ? columns
        .slice(coverage.start, coverage.start + coverage.span)
        .map((column, offset) => clipLabel(column.label) || String(coverage.start + offset + 1))
    : [];
  const dispatch = (op: Op | null) => {
    applyPanelOp(controller, op);
  };
  const commitSpan = (raw: string) => {
    dispatch(spanOp(path, columns.length, raw));
  };
  // The selection travels the way the Delete key's does
  // (`tree/selection`'s `nextSelectionAfterRemove`) — to the group that slides
  // into the freed slot, the new last one, or the table once none is left — so
  // the panel never shows a form for a group that is gone.
  // A group has no start column of its own — it begins where the one before it
  // ends — so removing one that covers columns moves every later group left onto
  // other columns. Said BEFORE the click (and only then: the last group, or one
  // layout already drops, moves nothing).
  const shiftId = useId();
  const shifts = coverage !== null && index < groups.length - 1;
  const remove = () => {
    if (controller.apply(removeHeaderGroupOp(tablePath, index, groups.length)).ok) {
      onSelectPath?.(
        groups.length <= 1
          ? tablePath
          : `${tablePath}.headerGroups[${Math.min(index, groups.length - 2)}]`,
      );
    }
  };
  return (
    <aside className={PANEL} aria-label={t('panel.title')}>
      <div>
        <section className="mb-4">
          <h3 className={SECTION_TITLE}>{t('panel.section.headerGroup')}</h3>
          <Field label={t('panel.headerGroup.label')}>
            <input
              key={group.label}
              type="text"
              className={INPUT}
              defaultValue={group.label}
              onBlur={(event) => {
                if (event.currentTarget.value !== group.label) {
                  dispatch(plainTextOp(path, ['label'], event.currentTarget.value));
                }
              }}
            />
          </Field>
          <StepperField
            label={t('panel.headerGroup.span')}
            value={group.span}
            canStep={coverage !== null}
            onCommit={commitSpan}
            // Steps from the RESOLVED coverage (what the render actually
            // draws), not the possibly-garbage authored text. The buttons are
            // disabled while coverage is null; the 0 base a disabled-state
            // race would step from authors nothing (`spanOp` refuses 0 and
            // out-of-range alike).
            onStep={(dir) => {
              commitSpan(String(coveredSpan + dir));
            }}
          />
          {covered.length > 0 ? (
            <p className="m-0 text-sm text-muted">
              {t('panel.headerGroup.spanHint', {
                columns: formatList(covered, locale),
                n: covered.length,
              })}
            </p>
          ) : null}
          <GroupStyleFields context={{ controller, path, tablePath, ...host }} />
          <button
            type="button"
            className={`${BTN_SM} mt-3`}
            onClick={remove}
            aria-describedby={shifts ? shiftId : undefined}
          >
            {t('panel.headerGroup.remove')}
          </button>
          {shifts ? (
            <p id={shiftId} className="mt-1 mb-0 text-sm text-muted">
              {t('panel.headerGroup.removeShifts')}
            </p>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
