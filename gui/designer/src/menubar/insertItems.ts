// What one armed INSERT group becomes as menu rows: the per-entry-kind dispatch,
// plus the two gates that show a row DISABLED with its reason rather than hiding
// it (a band-only element outside a header/footer, save-block without a savable
// selection) — an affordance that appears and disappears is worse than one that
// explains itself.

import { requiresBand } from '../insert/bandPlacement';
import type { InsertGroup } from '../insert/insertMenu';
import type { MenubarWiring, MenuItem } from './model';

/** Map one armed insert group to menu items, dispatching per entry kind. */
export function insertItems(
  t: (key: string) => string,
  group: InsertGroup,
  w: MenubarWiring,
): MenuItem[] {
  return group.entries.map((entry) => {
    if (entry.kind === 'element') {
      const blocked = requiresBand(entry.insert) && !w.bandTarget;
      return {
        label: blocked
          ? `${t(entry.labelKey)} — ${t('insert.pageNumber.bandOnly')}`
          : t(entry.labelKey),
        run: () => w.onInsertKind(entry.insert),
        disabled: blocked,
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
      return { label: entry.name, run: () => w.onInsertBlock(entry.blockId) };
    }
    if (entry.kind === 'manageBlock') {
      return { label: t(entry.labelKey), run: w.onManageBlocks };
    }
    return { label: t(entry.labelKey), run: w.onImage };
  });
}
