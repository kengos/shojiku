// The note under the flow surface that tells a reader, BEFORE their first
// mark, what the engine will treat differently once this plain text holds
// spans (`panel/spanConversion.conversionCauses`). Information only: nothing
// is blocked and nothing is asked — marking still converts, and the engine's
// own warning follows where it has one.
//
// ONE lead-in line, then one short line per cause in a fixed order: up to three
// causes can apply at once, and repeating the condition on each line under a
// small inline editor buried the part that differs.

import { useI18n } from '../i18n/context';
import type { ConversionCause } from '../panel/spanConversion';

/** Chrome, like the bar above the item: the note sits over the page, so it
 * takes the bar's surface rather than the page's ink. */
const NOTE = 'mt-1 rounded-md border border-border bg-chrome px-2 py-1 text-xs text-muted';

const CAUSE_KEYS: Readonly<Record<ConversionCause, string>> = {
  shrink: 'flow.convert.shrink',
  ellipsis: 'flow.convert.ellipsis',
  width: 'flow.convert.width',
  hanging: 'flow.convert.hanging',
};

export function ConversionNote({ causes }: { readonly causes: readonly ConversionCause[] }) {
  const { t } = useI18n();
  if (causes.length === 0) {
    return null;
  }
  return (
    <div className={NOTE}>
      <p>{t('flow.convert.lead')}</p>
      <ul className="m-0 list-none pl-2">
        {causes.map((cause) => (
          <li key={cause}>{t(CAUSE_KEYS[cause])}</li>
        ))}
      </ul>
    </div>
  );
}
