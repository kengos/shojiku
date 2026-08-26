// The 「hide the header row on the page」 control, and the note that keeps the
// header band's fields honest while it is on — two exports, because the two
// belong in two different places.
//
// They used to be one component, on the argument that they are one idea. They
// are, but the idea has two ENDS: the checkbox is a table-level switch, the
// peer of the zebra toggle, and burying it inside 「Detailed formatting」 hid a
// setting an author looks for at the top (Excel puts it top-level, and so does
// every spreadsheet that has one). The note is the other end — it is about the
// header BAND's fields, so it has to sit beside them, inside the disclosure,
// or it names fields the reader cannot see.
//
// Its own leaf rather than more lines in `TableStyleSection.tsx`, which sits
// at the executable-line cap.
//
// Capability-gated: an older engine parse-REJECTS `header.visuallyHidden`,
// so the control must not be offered against one. The note is NOT gated on the
// capability — it is gated on the authored value, because a document can carry
// the key even where this engine would not offer it.

import type { Op } from '@shojiku/designer-core';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { hasCapability } from './itemPanelProps';
import { HIDDEN_HEADER_CAPABILITY, hiddenHeaderToggleOp } from './tableStyleOps';

/** The table-level switch, rendered beside the zebra toggle. Absent — not
 * disabled — against an engine that would reject the key. */
export function HiddenHeaderToggle({
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
  if (!hasCapability(capabilities, HIDDEN_HEADER_CAPABILITY)) {
    return null;
  }
  // Excel's 「header row」 checkbox, honestly: Shojiku's header row always
  // exists, so an OFF state can mean "present to a reader, absent to the
  // eye" instead of "painted white".
  return (
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
  );
}

/** The note, rendered inside the disclosure ABOVE the header band's fields —
 * the fields it is about. */
export function HiddenHeaderNote({ hidden }: { readonly hidden: boolean }) {
  const { t } = useI18n();
  // While the row is hidden the engine paints NONE of the header band's
  // fields (the cells resolve to alpha 0 and the band decoration is skipped),
  // so they are offered but ineffective — the same situation the
  // `ineffectiveFill` banner already names, and the same treatment. They stay
  // EDITABLE: unticking restores every one of them, and disabling would hide
  // values the document really carries.
  if (!hidden) {
    return null;
  }
  return (
    <p className="mb-2 rounded-sj bg-warn-bg px-2 py-1.5 text-sm text-warn-text">
      {t('panel.tableStyle.headerHiddenIgnored')}
    </p>
  );
}
