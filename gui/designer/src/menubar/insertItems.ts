// What one armed INSERT group becomes as menu rows: the per-entry-kind dispatch,
// plus the gates that show a row DISABLED with its reason rather than hiding it
// (a band-only element anywhere but directly in a header/footer, a flow-only
// element outside the body's flow, a saved block whose node needs an owner the insert target is
// not, save-block without a savable selection) — an affordance that appears and
// disappears is worse than one that explains itself. A saved block that holds an
// item no target can draw keeps its row ENABLED and carries that as a note.

import type { OwnerKind } from '../canvas/dnd';
import { requiresBand } from '../insert/bandPlacement';
import { requiresFlow } from '../insert/flowPlacement';
import type { InsertGroup, InsertKind } from '../insert/insertMenu';
import type { MenubarWiring, MenuItem } from './model';

/** The reason an element row is blocked, or `null` when it is not. The two
 * gates are mutually exclusive by construction — no kind both requires a band
 * and requires the flow — so the first match wins and no precedence rule is
 * needed. */
function blockedReasonKey(kind: InsertKind, w: MenubarWiring): string | null {
  if (requiresBand(kind) && w.insertOwner !== 'band') {
    return 'insert.pageNumber.bandOnly';
  }
  return requiresFlow(kind) && w.insertOwner !== 'flow' ? 'insert.pageBreak.flowOnly' : null;
}

/** The reason a saved-block row is blocked against `owner`, or `null` when it
 * is not. `requires` is asked first, so which reason a row states is decided
 * here rather than left to the two sets. For a WELL-FORMED block they cannot
 * both be non-null — every kind `requiredOwner` names takes no `items` key at
 * all, so there is no chain for the refusal to be found down — but a block
 * comes from host storage, and a malformed one carrying both is answered by
 * this precedence rather than by that argument. */
function blockReasonKey(
  requires: 'band' | 'flow' | null,
  refuses: 'cell' | null,
  owner: OwnerKind,
): string | null {
  if (requires !== null && requires !== owner) {
    return requires === 'band' ? 'insert.block.bandOnly' : 'insert.block.flowOnly';
  }
  return refuses === owner ? 'insert.block.notInCell' : null;
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
      // The label IS the block's user-chosen name (React-escaped text). A node
      // that lays out in only one owner kind is skipped by the engine in every
      // other — and one that a single owner refuses is skipped in that one —
      // so wherever the insert target is such an owner the row states the
      // reason rather than acting, the same shape as the element rows above.
      // A nested kind that draws under no target is not a reason to refuse
      // this one — it is a note, on the row whether or not it is disabled here.
      const reasonKey = blockReasonKey(entry.requires, entry.refuses, w.insertOwner);
      return {
        label: reasonKey === null ? entry.name : `${entry.name} — ${t(reasonKey)}`,
        run: () => w.onInsertBlock(entry.blockId),
        disabled: reasonKey !== null,
        ...(entry.neverDraws ? { note: t('insert.block.neverDraws') } : {}),
      };
    }
    if (entry.kind === 'manageBlock') {
      return { label: t(entry.labelKey), run: w.onManageBlocks };
    }
    return { label: t(entry.labelKey), run: w.onImage };
  });
}
