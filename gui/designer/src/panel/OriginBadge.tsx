// The effective-value hint shown under an UNSET style control in the decoration tab:
// what the field actually renders with (the cascade-resolved value, thin), where
// that value comes from (default / style "name" / inherited), and — when that origin
// is AUTHORED somewhere — a jump to the document-settings surface that owns it.
// So a font-less title still shows the size it inherits — with one click to the
// place that authored it — instead of looking blank; the engine-default floor
// shows the value alone, since there is no authored place to go.
// Resolution is the ONE cascade mirror (`toolbar/effective.ts`);
// this component only DISPLAYS an `EffectiveValue` (value + styleName rendered
// as React text, never markup — a hostile style name is inert here).

import { useI18n } from '../i18n/context';
import type { EffectiveValue } from '../toolbar/effective';

/** Which document-settings section a jump from a given origin opens:
 * a named-style value jumps to the styles registry, an inherited/default value
 * to the document defaults. */
export type DefaultsSection = 'defaults' | 'styles';

export interface OriginBadgeProps {
  readonly effective: EffectiveValue;
  /** Jump to the document-settings surface (clears the selection), opening the
   * section that owns the resolved value. Absent → no jump control; an
   * `engine`-origin value has no authored owner and never shows one either. */
  readonly onNavigate?: (section: DefaultsSection) => void;
}

/** Renders nothing when the field carries its OWN value (no cascade to explain)
 * or resolves to nothing (`unset` — the engine default applies, so there is no
 * authored source to show or jump to). Otherwise the hint line. */
export function OriginBadge({ effective, onNavigate }: OriginBadgeProps) {
  const { t } = useI18n();
  if (effective.own !== '' || effective.origin === 'unset') {
    return null;
  }
  const { value, origin, styleName } = effective;
  const label =
    origin === 'style'
      ? t('toolbar.origin.style', { name: styleName })
      : origin === 'inherited'
        ? t('toolbar.origin.inherited')
        : t('toolbar.origin.default');
  const section: DefaultsSection = origin === 'style' ? 'styles' : 'defaults';
  // The engine-default floor has no authored source to visit: document settings would
  // only show the same value seeded back. Keep the effective-value + default line (it
  // answers "what is the default?"), drop the jump — on a blank text item that origin
  // alone would stack ~6 identical links down the decoration tab.
  const jumpable = origin !== 'engine';
  return (
    <p className="-mt-1.5 mb-2 flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
      <span>
        {t('panel.effective.label')} <span className="text-text">{value}</span>
      </span>
      <span aria-hidden="true">·</span>
      <span>{label}</span>
      {jumpable && onNavigate !== undefined ? (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-accent underline"
          onClick={() => onNavigate(section)}
        >
          {t('panel.effective.jump')}
        </button>
      ) : null}
    </p>
  );
}
