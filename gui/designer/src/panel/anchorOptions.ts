// The option TEXT each anchor target shows: the layer tree's label with the
// kind (`panel.anchor.option`), or the kind alone for an item with no content —
// and, where two or more options would read the same ("Rectangle",
// "Rectangle"), a number in document order ("Rectangle 1", "Rectangle 2"), so a
// picker never offers choices the user cannot tell apart. The LABEL is clipped
// (`anchorLabel`), never the kind, so a long label cannot push the kind out.

import type { I18n } from '../i18n/context';
import type { IdHolder } from '../ids/walk';
import { kindName } from '../tree/labels';
import { anchorLabel } from './ellipseAnchor';

/** Each candidate's option text, by path. */
export function optionTexts(
  candidates: readonly IdHolder[],
  t: I18n['t'],
): ReadonlyMap<string, string> {
  const base = candidates.map((holder) => {
    const kind = kindName(holder.kind, t);
    return holder.label === null
      ? kind
      : t('panel.anchor.option', { label: anchorLabel(holder.label), kind });
  });
  const total = new Map<string, number>();
  for (const text of base) {
    total.set(text, (total.get(text) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  candidates.forEach((holder, index) => {
    const text = base[index] as string;
    if ((total.get(text) as number) < 2) {
      out.set(holder.path, text);
      return;
    }
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    out.set(holder.path, t('panel.anchor.ordinal', { text, n }));
  });
  return out;
}
