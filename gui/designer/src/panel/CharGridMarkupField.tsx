// The 「interpret ruby notation in this content」 switch, on the CONTENT tab.
//
// Its own leaf rather than more lines in `ContentSection.tsx`, which sits nine
// executable lines under the cap: gating inside the component costs that file one
// import and one mount instead of a type test, a capability test and a mount.
//
// It carries BOTH its gates for the same reason `HiddenHeaderToggle` does — the
// type test, because only a `char_grid` has this key, and the capability test,
// because an engine without `char_grid.markup.aozora` would reject the value.
//
// The sentence under it is not decoration. Turning this on changes what the
// template does with data it does not control: `《》` in a customer's name stops
// being two characters and starts being a ruby annotation. The engine's posture is
// that bound user data is never interpreted by default, so the one control that
// opts out of it says what it is opting out of.

import { useI18n } from '../i18n/context';
import { CHAR_GRID_TYPE } from './charGrid';
import { CHAR_GRID_MARKUP_CAPABILITY, markupOp, readCharGridMarkup } from './charGridMarkup';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';

export function CharGridMarkupField(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, capabilities } = props;
  if (view.type !== CHAR_GRID_TYPE || !hasCapability(capabilities, CHAR_GRID_MARKUP_CAPABILITY)) {
    return null;
  }
  const on = readCharGridMarkup(controller.read, path);
  return (
    <div className="mb-2">
      <label className="flex items-center gap-1.5 text-sm text-text">
        <input
          type="checkbox"
          className="accent-accent"
          checked={on}
          onChange={() => applyPanelOp(controller, markupOp(path, !on))}
        />
        {t('panel.charGrid.markup')}
      </label>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
        {t('panel.charGrid.markupSafety')}
      </p>
    </div>
  );
}
