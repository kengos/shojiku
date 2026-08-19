// The 「hide the header row on the page」 control, and the note that keeps the
// header band's fields honest while it is on.
//
// Its own leaf rather than more lines in `TableStyleSection.tsx` (which sits at
// the executable-line cap): the two halves are one idea — the row is present to
// a reader and absent to the eye — and the band fields BELOW it are the thing
// that idea makes ineffective, so they have to move together or not at all.
//
// Capability-gated: an older engine parse-REJECTS `header.visuallyHidden`
// outright, so the control must not be offered against one. The note is NOT
// gated on the capability — it is gated on the authored value, because a
// document can carry the key even where this engine would not offer it.

import type { Op } from '@shojiku/designer-core';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { hasCapability } from './itemPanelProps';
import { HIDDEN_HEADER_CAPABILITY, hiddenHeaderToggleOp } from './tableStyleOps';

export function HiddenHeaderField({
  path,
  hidden,
  capabilities,
  onOp,
}: {
  readonly path: string;
  /** The authored `header.visuallyHidden`, already read as a strict boolean. */
  readonly hidden: boolean;
  readonly capabilities: readonly string[] | undefined;
  readonly onOp: (op: Op) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {hasCapability(capabilities, HIDDEN_HEADER_CAPABILITY) ? (
        // Excel's 「header row」 checkbox, honestly: Shojiku's header row always
        // exists, so an OFF state can mean "present to a reader, absent to the
        // eye" instead of "painted white".
        <label className="mb-2 flex items-center gap-1.5 text-sm text-text">
          <input
            type="checkbox"
            checked={hidden}
            onChange={() => onOp(hiddenHeaderToggleOp(path, hidden))}
          />
          {t('panel.tableStyle.hiddenHeader')}
          <HelpHint
            label={t('help.hiddenHeader.title')}
            title={t('help.hiddenHeader.title')}
            body={t('help.hiddenHeader.body')}
          />
        </label>
      ) : null}
      {/* While the row is hidden the engine paints NONE of the header band's
        fields (the cells resolve to alpha 0 and the band decoration is
        skipped), so they are offered but ineffective — the same situation the
        `ineffectiveFill` banner already names, and the same treatment. They
        stay EDITABLE: unticking restores every one of them, and disabling
        would hide values the document really carries. */}
      {hidden ? (
        <p className="mb-2 rounded-sj bg-warn-bg px-2 py-1.5 text-sm text-warn-text">
          {t('panel.tableStyle.headerHiddenIgnored')}
        </p>
      ) : null}
    </>
  );
}
