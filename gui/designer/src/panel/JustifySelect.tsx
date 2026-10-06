// The distribution dropdown of the child-layout section: how the children share
// the space left over ALONG the arrangement (`justifyContent`). The first three
// choices are named for the main axis — left / center / right in a row and in a
// grid, top / middle / bottom in a stack — and the three spreads read the same
// either way. A grid shows it only over a column-track LIST: a column count
// consumes the whole width, so there is nothing left to distribute. A stack with
// no height of its own has no leftover height either, and says so under the
// control rather than hiding it (a parent can still give the stack a height).
//
// An authored value outside the engine vocabulary stays a selectable option,
// verbatim — a closed control over the wire must not show it as unset. A re-pick
// of the effective value authors nothing.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { Select, type SelectOption } from '../ui/Select';
import type { ContainerLayout } from './layoutModel';
import { JUSTIFY_VALUES, type JustifyValue } from './layoutOps';

/** Whether the arrangement offers the dropdown at all. */
export function offersJustify(layout: ContainerLayout): boolean {
  return layout.mode !== 'grid' || layout.columnsIsList;
}

function labelKey(value: JustifyValue, vertical: boolean): string {
  if (value === 'start' || value === 'center' || value === 'end') {
    return `panel.layout.justify.${vertical ? 'v' : 'h'}.${value}`;
  }
  return `panel.layout.justify.${value}`;
}

export function JustifySelect({
  layout,
  onPick,
}: {
  readonly layout: ContainerLayout;
  readonly onPick: (value: JustifyValue) => void;
}) {
  const { t } = useI18n();
  const vertical = layout.mode === 'column';
  const options: SelectOption[] = JUSTIFY_VALUES.map((value) => ({
    value,
    label: t(labelKey(value, vertical)),
  }));
  const current = layout.justifyContent;
  if (!options.some((option) => option.value === current)) {
    options.push({ value: current, label: current });
  }
  const needsHeight = vertical && !layout.hasHeight;
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.layout.justify')}</span>
      <Select
        label={t('panel.layout.justify')}
        value={current}
        options={options}
        onChange={(value) => {
          // Every option but the current one is an engine value, so a change is
          // always authorable; a re-pick of the current one (an out-of-vocabulary
          // value carried verbatim included) authors nothing.
          if (value !== current) {
            onPick(value as JustifyValue);
          }
        }}
      />
      {needsHeight ? (
        <p className="mt-1 mb-0 text-[11px] text-muted leading-relaxed">
          {t('panel.layout.justify.needsHeight')}
        </p>
      ) : null}
    </div>
  );
}
