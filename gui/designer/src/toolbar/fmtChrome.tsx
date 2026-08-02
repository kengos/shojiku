// The format toolbar's shared chrome: the class strings every control rides,
// the two tiny presentational marks (caret, group separator), the
// "where this value comes from" hint helpers, and the press-toggle button.
//
// Everything here exists so the cluster reads as ONE bar: a fixed-height rail
// (`FMT_BTN`) keeps every control on the same visual line whatever glyph or
// swatch it carries, and the popover/menu-row strings keep the dropdowns
// identical to each other. Native `title` is banned package-wide (its
// OS-controlled ~1s delay reads as "no tooltip"), so every control here carries
// a `TipBubble` instead.

import type { ReactNode } from 'react';
import type { I18n } from '../i18n/context';
import { IconChevronDown } from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import type { EffectiveValue } from './effective';

/** A compact format-toolbar button (toggle, color trigger, dropdown trigger).
 * Fixed-height flex centering keeps every control on one visual rail whatever
 * glyph or swatch it carries. */
export const FMT_BTN =
  'inline-flex h-8 min-w-[28px] cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-2 leading-none text-text hover:border-muted aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent disabled:cursor-default disabled:opacity-40';

/** A format-toolbar popover panel (color grid, dropdown menus); the call site
 * adds its own padding. */
export const FMT_POPOVER =
  'absolute left-0 top-[calc(100%+var(--sj-space-1))] z-10 rounded-md border border-border bg-surface shadow-[0_4px_12px_rgb(0_0_0/0.15)]';

/** A plain dropdown row (family menu, style-picker tails). */
export const MENU_ROW =
  'flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1 text-left text-text hover:bg-chrome';

/** The dropdown-trigger caret shared by the style / family / align triggers. */
export function Caret() {
  return <IconChevronDown size={11} className="ml-1 shrink-0 text-muted" />;
}

/** The thin vertical rule between toolbar clusters (gdoc-style grouping). */
export function Sep() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

/** The "where this value comes from" hint for a control showing a cascade
 * value (a `title` tooltip + the same text for assistive tech); `undefined`
 * for an own/unset value — nothing to explain. */
export function originHint(t: I18n['t'], eff: EffectiveValue): string | undefined {
  if (eff.origin === 'style') {
    return t('toolbar.origin.style', { name: eff.styleName });
  }
  if (eff.origin === 'inherited') {
    return t('toolbar.origin.inherited');
  }
  // Both a `defaults.style` value and the engine-default floor read as the default origin —
  // the user's mental model is one "document default", not two layers.
  return eff.origin === 'default' || eff.origin === 'engine'
    ? t('toolbar.origin.default')
    : undefined;
}

/** Every control's hover tooltip: its NAME, plus the origin hint when the
 * shown value comes from the cascade — a hover must always say what the
 * button does (gdoc behavior), never only where a value came from. */
export function hintTitle(label: string, hint: string | undefined): string {
  return hint === undefined ? label : `${label} — ${hint}`;
}

/** A press-toggle button reflecting an on/off style value. */
export function ToggleButton({
  label,
  glyph,
  pressed,
  hint,
  onToggle,
  tour,
}: {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly pressed: boolean;
  readonly hint?: string;
  readonly onToggle: (next: boolean) => void;
  readonly tour?: string;
}) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        className={FMT_BTN}
        data-tour={tour}
        aria-label={label}
        aria-pressed={pressed}
        onClick={() => onToggle(!pressed)}
      >
        {glyph}
      </button>
      <TipBubble text={hintTitle(label, hint)} />
    </span>
  );
}
