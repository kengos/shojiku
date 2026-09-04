// What one armed INSERT group becomes as menu rows: the per-entry-kind dispatch,
// plus the gates that show a row DISABLED with its reason rather than hiding it
// (a band-only element outside a header/footer, a flow-only element outside the
// body's flow, save-block without a savable selection) — an affordance that
// appears and disappears is worse than one that explains itself.

import { requiresBand } from '../insert/bandPlacement';
import { requiresFlow } from '../insert/flowPlacement';
import type { InsertGroup, InsertKind } from '../insert/insertMenu';
import type { MenubarWiring, MenuItem } from './model';

/** The reason an element row is blocked, or `null` when it is not. The two
 * gates are mutually exclusive by construction — no kind both requires a band
 * and requires the flow — so the first match wins and no precedence rule is
 * needed. */
function blockedReasonKey(kind: InsertKind, w: MenubarWiring): string | null {
  if (requiresBand(kind) && !w.bandTarget) {
    return 'insert.pageNumber.bandOnly';
  }
  return requiresFlow(kind) && !w.flowTarget ? 'insert.pageBreak.flowOnly' : null;
}

/** Map one armed insert group to menu items, dispatching per entry kind. */
export function insertItems(
  t: (key: string) => string,
  group: InsertGroup,
  w: MenubarWiring,
): MenuItem[] {
  return group.entries.map((entry) => {
    if (entry.kind === 'element') {
      const reasonKey = blockedReasonKey(entry.insert, w);
      return {
        label: reasonKey === null ? t(entry.labelKey) : `${t(entry.labelKey)} — ${t(reasonKey)}`,
        run: () => w.onInsertKind(entry.insert),
        disabled: reasonKey !== null,
      };
    }
    if (entry.kind === 'band') {
      return { label: t(entry.labelKey), run: () => w.onBand(entry.band) };
    }
    if (entry.kind === 'container') {
      return { label: t(entry.labelKey), run: w.onContainer };
    }
    if (entry.kind === 'iterable') {
      return { label: t(entry.labelKey), run: w.onIterable };
    }
    if (entry.kind === 'field') {
      return { label: t(entry.labelKey), run: w.onField };
    }
    if (entry.kind === 'paste') {
      return { label: t(entry.labelKey), run: w.onPaste };
    }
    if (entry.kind === 'saveBlock') {
      // No savable selection → visible but disabled with the reason, so the
      // affordance never appears and disappears (the band-only-row precedent).
      const blocked = !w.blockSavable;
      return {
        label: blocked
          ? `${t(entry.labelKey)} — ${t('insert.saveBlock.needsSelection')}`
          : t(entry.labelKey),
        run: w.onSaveBlock,
        disabled: blocked,
      };
    }
    if (entry.kind === 'block') {
      // The label IS the block's user-chosen name (React-escaped text).
      // A flow-only block inside a band does not parse — the document stops
      // rendering entirely — so the row states the reason rather than acting,
      // the same shape as the band-only page number above.
      const blocked = entry.flowOnly && w.bandTarget;
      return {
        label: blocked ? `${entry.name} — ${t('insert.block.flowOnly')}` : entry.name,
        run: () => w.onInsertBlock(entry.blockId),
        disabled: blocked,
      };
    }
    if (entry.kind === 'manageBlock') {
      return { label: t(entry.labelKey), run: w.onManageBlocks };
    }
    return { label: t(entry.labelKey), run: w.onImage };
  });
}
