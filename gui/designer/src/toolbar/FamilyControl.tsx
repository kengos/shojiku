// The format toolbar's font-family dropdown.

import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { IconCheck } from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import type { EffectiveValue } from './effective';
import { Caret, FMT_BTN, FMT_POPOVER, hintTitle, MENU_ROW, originHint } from './fmtChrome';

/** The font-family dropdown (gdoc-style): the trigger shows the EFFECTIVE
 * family (placeholder label when unset everywhere), the menu lists the host's
 * options (current value included) with the current one checked, and — when
 * the host wires an add-font flow — a tail row opens it. Picking the current
 * value writes nothing. */
export function FamilyControl({
  eff,
  options,
  onPick,
  onAddFont,
}: {
  readonly eff: EffectiveValue;
  readonly options: readonly string[];
  readonly onPick: (name: string) => void;
  readonly onAddFont?: () => void;
}) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const names = Array.from(new Set(eff.value === '' ? options : [...options, eff.value]));
  // Nothing to list and no add-font flow → no dropdown at all (an empty menu
  // is a dead control); the panel's free-text family field remains the path.
  if (names.length === 0 && onAddFont === undefined) {
    return null;
  }
  return (
    <div className="group/tip relative" ref={rootRef}>
      {open ? null : <TipBubble text={hintTitle(t('toolbar.fontFamily'), originHint(t, eff))} />}
      <button
        type="button"
        className={FMT_BTN}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('toolbar.fontFamily')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`max-w-[110px] truncate ${eff.value === '' ? 'text-muted' : ''}`}>
          {eff.value === '' ? t('toolbar.fontFamily') : eff.value}
        </span>
        <Caret />
      </button>
      {open ? (
        <div role="menu" className={`${FMT_POPOVER} flex min-w-[160px] flex-col p-1`}>
          {names.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitemradio"
              aria-checked={name === eff.value}
              className={MENU_ROW}
              onClick={() => {
                setOpen(false);
                if (name !== eff.value) {
                  onPick(name);
                }
              }}
            >
              <span aria-hidden className="inline-flex w-3 shrink-0 text-accent">
                {name === eff.value ? <IconCheck size={12} /> : null}
              </span>
              <span className="min-w-0 truncate">{name}</span>
            </button>
          ))}
          {onAddFont !== undefined ? (
            <>
              {names.length > 0 ? (
                <div aria-hidden className="my-1 border-t border-border" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={MENU_ROW}
                onClick={() => {
                  setOpen(false);
                  onAddFont();
                }}
              >
                {t('menu.addFont')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
