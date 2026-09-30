// One padding or margin editor over `edgeModel`: an all-sides stepper, then the
// sides as a 2×2 grid (top, right, bottom, left — the wire's order, and the
// reading order of a margins dialog). Every side takes a unit (`5mm`, `10%`);
// the all-sides field is the plain number the wire's short form holds. Where
// only the left and right sides reach the page (a table in the flow body) the
// all-sides field is withheld — it would also write the two sides that do
// nothing — and only those two are shown.
//
// A margin side that can take `auto` here is a type-or-pick field
// (`NumericComboField`): picking beats typing a keyword the reader would have
// to know. Everywhere else a side is a stepper. An authored `auto` on a side
// that cannot use it here still shows — as itself, with a line saying it has
// no effect — rather than reading as unset.

import type { Op } from '@shojiku/designer-core';
import { isRelativeLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { formatList } from '../i18n/format';
import {
  EDGE_SIDES,
  type EdgeKey,
  type EdgeRules,
  type EdgeSide,
  edgeSteppable,
  readEdge,
} from './edgeModel';
import { edgeSideOps, edgeSideStepOps, edgeUniformOps, edgeUniformStepOps } from './edgeOps';
import { NumericComboField } from './NumericComboField';
import { StepperField } from './StepperField';

export interface EdgeFieldsProps {
  readonly controller: EditorController;
  readonly path: string;
  readonly edgeKey: EdgeKey;
  readonly rules: EdgeRules;
}

export function EdgeFields({ controller, path, edgeKey, rules }: EdgeFieldsProps) {
  const { t, locale } = useI18n();
  const view = readEdge(controller.read(path), edgeKey);
  const dispatch = (ops: Op[] | null): void => {
    if (ops !== null) {
      controller.applyAll(ops);
    }
  };
  const commitSide = (side: EdgeSide, entry: string) =>
    dispatch(edgeSideOps(path, edgeKey, view, side, entry, rules));
  const side = (s: EdgeSide) => {
    const value = view.sides[s];
    const sideLabel = t('panel.edge.side', {
      side: t(`panel.edge.${s}`),
      edge: t(`panel.edge.${edgeKey}`),
    });
    if (rules.auto.has(s)) {
      return (
        <NumericComboField
          key={s}
          label={sideLabel}
          value={value}
          placeholder="0"
          unit="pt"
          presets={[
            { value: 'auto', label: t('panel.edge.auto'), note: t('panel.edge.autoNote') },
            { value: '0', label: '0' },
          ]}
          onCommit={(entry) => commitSide(s, entry)}
        />
      );
    }
    return (
      <StepperField
        key={s}
        label={sideLabel}
        value={value}
        placeholder="0"
        unit="pt"
        unitHint={t('stepper.unitHint')}
        canStep={edgeSteppable(value)}
        stepHint={isRelativeLength(value) ? t('stepper.relativeUnit') : undefined}
        onCommit={(entry) => commitSide(s, entry)}
        onStep={(dir) => dispatch(edgeSideStepOps(path, edgeKey, view, s, dir, rules))}
      />
    );
  };
  // Sides carrying an `auto` this placement ignores — named in the note, since
  // one of them may be a side the editor does not even show (a flow-body
  // table's top or bottom).
  const stranded = EDGE_SIDES.filter((s) => view.sides[s] === 'auto' && !rules.auto.has(s));
  const allSides = rules.sides.length === EDGE_SIDES.length;
  return (
    <div>
      {allSides ? (
        <StepperField
          label={t('panel.edge.all', { edge: t(`panel.edge.${edgeKey}`) })}
          value={view.uniform}
          placeholder={view.mode === 'perSide' ? '' : '0'}
          unit="pt"
          canStep={view.mode !== 'perSide' && view.mode !== 'other'}
          inputMode="decimal"
          onCommit={(entry) => dispatch(edgeUniformOps(path, edgeKey, view, entry, rules))}
          onStep={(dir) => dispatch(edgeUniformStepOps(path, edgeKey, view, dir, rules))}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">{rules.sides.map(side)}</div>
      {stranded.length > 0 ? (
        <p className="mt-0 mb-2 text-sm text-muted">
          {t('panel.edge.autoIneffective', {
            sides: formatList(
              stranded.map((s) =>
                t('panel.edge.side', {
                  side: t(`panel.edge.${s}`),
                  edge: t(`panel.edge.${edgeKey}`),
                }),
              ),
              locale,
            ),
          })}
        </p>
      ) : null}
    </div>
  );
}
