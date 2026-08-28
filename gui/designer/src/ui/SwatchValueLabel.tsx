// What colour a field is currently set to, in WORDS, beside its chip.
//
// The picker's own readout names a colour only while the popover is open, and it
// throws that answer away on close. With the popover shut the chip is the entire
// state of the field — so a reader who cannot distinguish `#b91c1c` from `#15803d`
// has to open the palette to learn which one is set, every time. That is the state
// this widget removes, and it is a first-party accessibility requirement rather than
// a nicety: the reader who asked for the palette work has colour vision deficiency.
//
// It lives beside the FIELD rather than inside `ColorSwatchPicker` because the
// trigger chrome is caller-owned and ranges from a toolbar icon button (no room for
// a line of text) to a panel swatch (plenty). The widget presents a value; where a
// name can be shown is the caller's question.
//
// The name comes from `swatchName`, so it is the SAME name the popover's readout and
// each swatch's accessible name use — a palette colour reads as its hue and darkness
// step, anything else as its own hex, and there is one derivation for all three
// channels.

import { useI18n } from '../i18n/context';
import { isHexColor } from './chipContrast';
import { swatchName } from './swatchNames';

// Nothing here clips, unlike the popover's readout, and the difference is the
// guard rather than an oversight: that readout renders whatever the document
// carries (`display()` passes any string through unbounded), while this returns
// early unless the value is a validated `#rrggbb` — seven characters. The name
// derived from it is a catalog string. Neither can grow, so a clip would be a
// branch no input can take.

export function SwatchValueLabel({ value }: { readonly value: string }) {
  const { t } = useI18n();
  if (!isHexColor(value)) {
    // Unset, and also the hostile `url(…)`/`expression(…)` a template can carry:
    // neither is a colour, and neither has a name worth echoing back. The chip
    // beside this already draws the unset chequerboard for both.
    return <span className="text-muted text-xs">{t('color.unset')}</span>;
  }
  const name = swatchName(value, t);
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-text text-xs">{name}</span>
      {/* A colour the palette does not carry has no name but its own hex, so the
          second line would repeat the first verbatim — which is what the field
          showed for the genkoyoshi ruling (`#a8674f` twice), and it reads as a
          rendering fault rather than as "this colour has no name". Found by
          looking at the running panel; every jsdom case passed over it. */}
      {name === value ? null : (
        <span className="truncate text-[10px] text-muted tabular-nums">{value}</span>
      )}
    </span>
  );
}
