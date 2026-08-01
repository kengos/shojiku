// The format toolbar's alignment dropdown and its glyph table.

import type { ReactNode } from 'react';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { IconAlignCenter, IconAlignLeft, IconAlignRight } from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import type { EffectiveValue } from './effective';
import { Caret, FMT_BTN, FMT_POPOVER, hintTitle, originHint } from './fmtChrome';
import { ALIGN_VALUES } from './model';

/** The gdoc-style alignment icons; the accessible name carries the localized
 * meaning (the icons are decorative). */
const ALIGN_ICONS: Record<
  (typeof ALIGN_VALUES)[number],
  (props: { readonly size?: number }) => ReactNode
> = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

/** The alignment dropdown (gdoc-style): the trigger shows the ACTIVE
 * alignment's glyph, and clicking it drops a row of the three options with the
 * active one checked. One op per pick (clicking the active one reverts to the
 * cascade — the alignOp contract, unchanged). */
export function AlignControl({
  eff,
  active,
  onPick,
}: {
  readonly eff: EffectiveValue;
  readonly active: string;
  readonly onPick: (value: (typeof ALIGN_VALUES)[number]) => void;
}) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  // A non-enum authored value shows the left glyph (the engine default) and
  // checks no row. `data-align` carries the SHOWN value for tests/tooling.
  const shown = (ALIGN_VALUES as readonly string[]).includes(active)
    ? (active as (typeof ALIGN_VALUES)[number])
    : 'left';
  const ShownIcon = ALIGN_ICONS[shown];
  return (
    <div className="group/tip relative" ref={rootRef}>
      {open ? null : <TipBubble text={hintTitle(t('toolbar.align'), originHint(t, eff))} />}
      <button
        type="button"
        className={FMT_BTN}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour={TOUR_ANCHORS.toolbarAlign}
        aria-label={t('toolbar.align')}
        data-align={shown}
        onClick={() => setOpen((v) => !v)}
      >
        <ShownIcon />
        <Caret />
      </button>
      {open ? (
        <div role="menu" className={`${FMT_POPOVER} flex gap-0.5 p-1`}>
          {ALIGN_VALUES.map((value) => {
            const Icon = ALIGN_ICONS[value];
            return (
              <span key={value} className="group/tip relative inline-flex">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active === value}
                  className={`${FMT_BTN} aria-checked:border-accent aria-checked:bg-accent aria-checked:text-on-accent`}
                  aria-label={t(`toolbar.align.${value}`)}
                  onClick={() => {
                    setOpen(false);
                    onPick(value);
                  }}
                >
                  <Icon />
                </button>
                <TipBubble text={t(`toolbar.align.${value}`)} />
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
