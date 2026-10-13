// The 「error correction」 select for a QR code, on the CONTENT tab: the level
// decides how the content is ENCODED, as an image's fit decides how its picture
// fills the box, so it sits under the content fields rather than with the fill.
//
// Its own leaf rather than more lines in `ContentSection.tsx`, for the reason
// `CharGridMarkupField` gives: carrying its type gate here costs that file one
// import and one mount. No capability gate beyond the item's own — every engine
// that offers `qr_code` reads the key (`qrErrorCorrection.ts`).
//
// The empty row is the engine default said out loud and CLEARS the key, and the
// `medium` row writes it — so an item that never chose a level and one that
// chose the default read apart, as the image's fit and the text overflow selects
// do. Any other value the file already carries gets a row of its own, marked
// invalid (`qrErrorCorrection.ts` lists the shapes): every released engine
// refuses it, and the whole document with it, so the default row or a level is
// the repair.

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { FieldHelp } from './panelHelpers';
import {
  EC_LEVELS,
  errorCorrectionOf,
  errorCorrectionOp,
  UNREADABLE_LEVEL,
} from './qrErrorCorrection';
import { withAuthored } from './TextLookFields';

export function QrErrorCorrectionField({ controller, path, view }: ItemPanelProps) {
  const { t } = useI18n();
  const id = useId();
  if (view.type !== 'qr_code') {
    return null;
  }
  const own = errorCorrectionOf(controller.read, path);
  const known: readonly string[] = EC_LEVELS;
  return (
    <span className="mb-2 block">
      {/* The `?` is a sibling of the label, never inside it (StepperField's
          shape): a label's text is the select's accessible name. */}
      <span className="flex items-center gap-1">
        <label htmlFor={id} className={FIELD_LABEL}>
          {t('panel.field.errorCorrection')}
        </label>
        <FieldHelp topic="errorCorrection" />
      </span>
      <select
        id={id}
        className={INPUT}
        value={own.shown}
        onChange={(event) =>
          applyPanelOp(controller, errorCorrectionOp(path, own, event.currentTarget.value))
        }
      >
        <option value="">{t('panel.qr.ecDefault')}</option>
        {withAuthored(known, own.shown).map((level) => (
          <option key={level} value={level}>
            {known.includes(level)
              ? t(`panel.qr.ec.${level}`)
              : level === UNREADABLE_LEVEL
                ? t('panel.qr.ecUnreadable')
                : t('panel.qr.ecInvalid', { value: level })}
          </option>
        ))}
      </select>
    </span>
  );
}
