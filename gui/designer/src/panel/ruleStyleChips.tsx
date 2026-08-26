// What a COLLAPSED row-condition rule does, at a glance: one chip per style
// property it sets, so the rule list reads without opening every card.
//
// The strip says what the rule ADDS, and says so in words. Opening the card
// shows the band editors, which render the CASCADE-effective value — so a rule
// that sets nothing still shows a checked Bold when the body band is bold. The
// two are different questions and both are worth answering; what made them
// confusing was that only one of them was labelled, and that a rule adding
// nothing rendered as absence rather than as an answer.
//
// "Adds nothing" is a claim, so it has to be true of EVERY way a rule can add
// something — and this panel models FOUR of `Style`'s two dozen properties, so
// the chips are the wrong thing to decide it from. Three ways a rule adds
// something without earning a chip from the four:
//   - `styleNames`, which carries no `style.*` key at all and used to be
//     reported only inside the OPENED card;
//   - `fontWeight: normal`, which is what the Designer itself authors when you
//     un-tick Bold over a band that is bold — a real, deliberate edit that a
//     `=== 'bold'` boolean cannot tell apart from an unset weight;
//   - any of the ~20 properties the editor does not render (`fontSize`,
//     `opacity`, `borderWidth` …), which an externally-authored template
//     carries as a matter of course.
// So the sentence is decided from `styleKeyCount` + `styleNameCount` — the
// WIRE — and the remainder earns a chip of its own rather than vanishing.
// Getting this wrong would restate the very contradiction this file exists to
// remove, in the opposite direction and in words rather than as a blank.

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { chipRing, isHexColor } from '../ui/chipContrast';
import type { RowConditionRow } from './rowConditionsModel';

/** One chip per style property the rule sets. Colors show as a swatch dot (a
 * hex string means nothing to the nontech-pm). */
export function StyleChips({ rule }: { readonly rule: RowConditionRow }) {
  const { t } = useI18n();
  const chips: ReactNode[] = [];
  if (rule.textAlign !== '') {
    chips.push(<Chip key="align" label={t(`style.value.textAlign.${rule.textAlign}`)} />);
  }
  if (rule.fontWeight === 'bold') {
    chips.push(<Chip key="bold" label={t('panel.field.bold')} />);
  } else if (rule.fontWeight === 'normal') {
    chips.push(<Chip key="bold" label={t('panel.rowConditions.notBold')} />);
  }
  for (const [key, value, labelKey] of [
    ['bg', rule.backgroundColor, 'panel.field.backgroundColor'],
    ['fg', rule.color, 'panel.field.color'],
  ] as const) {
    if (value !== '') {
      chips.push(<Chip key={key} label={t(labelKey)} swatch={value} />);
    }
  }
  // Every `style` key this panel did NOT turn into a chip above, counted from
  // the wire rather than guessed from the four it models.
  const modelled = [rule.textAlign, rule.fontWeight, rule.backgroundColor, rule.color].filter(
    (value) => value !== '',
  ).length;
  const other = Math.max(0, rule.styleKeyCount - modelled);
  if (other > 0) {
    chips.push(<Chip key="other" label={t('panel.rowConditions.addsOther', { count: other })} />);
  }
  if (rule.styleNameCount > 0) {
    chips.push(
      <Chip
        key="names"
        label={t('panel.rowConditions.addsStyleNames', { count: rule.styleNameCount })}
      />,
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-1 px-2 pb-1.5 text-muted text-xs">
      {chips.length === 0 ? (
        t('panel.rowConditions.addsNothing')
      ) : (
        <>
          {t('panel.rowConditions.adds')}
          {chips}
        </>
      )}
    </div>
  );
}

/** One applied-style chip. An unknown alignment spelling degrades to its
 * own text (the localized label map is closed). */
function Chip({ label, swatch }: { readonly label: string; readonly swatch?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-px text-muted text-xs">
      {swatch === undefined ? null : (
        <span
          className="size-2.5 rounded-[3px] border border-border"
          // Narrowed FIRST, like every other site that paints a document
          // colour: the value comes from a `conditionalStyles` entry in an
          // untrusted template, and the two guards must agree — painting a
          // named CSS colour the ring cannot classify would leave a dot with no
          // outline. Same ring as every other chip: a dot this small otherwise
          // disappears into whichever scheme matches it.
          style={{
            backgroundColor: isHexColor(swatch) ? swatch : undefined,
            boxShadow: chipRing(swatch),
          }}
        />
      )}
      {label}
    </span>
  );
}
