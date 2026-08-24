// Creating a header/footer band. Until this module existed the Designer could
// only ever EDIT a band some template already authored: nothing in the
// deterministic UI wrote `sections.header` / `sections.footer`, so a document
// that started without one (every blank preset) could never grow one, and the
// band-only `page_number` row stayed greyed with no route to satisfy it.
//
// Framework-free (like `insertMenu.ts`) so every rule is exhaustively
// unit-testable. What the row DOES is deliberately idempotent — absent: create
// then select; present: select only — so the menu row and the layer-tree row
// can be the same word in both states rather than appearing, disappearing, or
// greying out (Google Docs' Insert → Headers & footers behaves the same way).

import type { Op, ReadFn } from '@shojiku/designer-core';

/** The two repeating bands. `sections.body` is not one of them: it is the
 * document, always present, and it carries a `type:` these never do. */
export type BandName = 'header' | 'footer';

/** Both bands, in the order the engine's `Sections` declares them — the same
 * order the layer tree walks, so a caller rendering one row per band gets
 * header above footer without sorting. */
export const BAND_NAMES: readonly BandName[] = ['header', 'footer'];

/** A fresh band's height in pt. The bundled examples run 40-100; 40 is the
 * tutorial seed's own value and the smallest that fits an ordinary footer
 * line. `Band.height` is informational — layout never reads it — but a
 * band with no positive height is not a canvas drop target
 * (`reparentTarget`'s `bandRegion` returns null), so it cannot be omitted. */
export const DEFAULT_BAND_HEIGHT_PT = 40;

/** A fresh band's repeat mode. `Band.repeat` is optional and the engine
 * already defaults to this, but it is authored EXPLICITLY: the property panel
 * shows the mode from the moment the band exists, rather than showing a
 * select over a key the file does not carry. */
export const DEFAULT_BAND_REPEAT = 'every_page';

/** The catalog key for a band's NAME. One key per band, shared by the layer
 * tree, the insert menu and the property panel heading — three surfaces naming
 * the same thing, so they cannot drift apart (the `TYPE_LABEL_KEYS`
 * precedent). The `tree.` spelling is where the words already lived. */
export const BAND_LABEL_KEYS: Readonly<Record<BandName, string>> = {
  header: 'tree.section.header',
  footer: 'tree.section.footer',
};

/** The structural path of a band — what the tree selects and the panel reads. */
export function bandPath(band: BandName): string {
  return `sections.${band}`;
}

/** The band a structural path names, or `null` for anything else. The reverse
 * of `bandPath`, and the only place the panel router needs to recognise a band
 * selection — an exact match, so `sections.footer.items[0]` (an item INSIDE
 * the band) is correctly not one. */
export function bandFromPath(path: string): BandName | null {
  return BAND_NAMES.find((name) => bandPath(name) === path) ?? null;
}

/** Whether the document already authors this band. A band that is present but
 * not a map (a hostile document putting a scalar or a list at `sections.footer`)
 * reads as PRESENT: it exists on the wire, so overwriting it would destroy
 * authored content, and the honest answer is to select it and let the panel
 * degrade. */
export function bandExists(read: ReadFn, band: BandName): boolean {
  return read(bandPath(band)) !== undefined;
}

/** The one op that creates a band: exactly the three keys `Band` declares.
 * `Band` is `deny_unknown_fields`, so a fourth key would be a parse error, and
 * two of these three are load-bearing rather than cosmetic — without
 * `items: []` an insert aimed at the band falls through to the body
 * (`resolveInsertTarget` needs the list to resolve into), and without a
 * positive `height` the band is not a canvas drop target. */
export function bandCreateOp(band: BandName): Op {
  return {
    op: 'putValue',
    keys: ['sections', band],
    value: { repeat: DEFAULT_BAND_REPEAT, height: DEFAULT_BAND_HEIGHT_PT, items: [] },
  };
}

/** What activating a band row does to the DOCUMENT: create it when it is
 * absent, and nothing at all when it is already there. The caller selects
 * `bandPath(band)` either way — that half is selection state, not a document
 * change, so re-activating a row that already has its band authors nothing and
 * mints no undo step. */
export function bandActivateOps(read: ReadFn, band: BandName): readonly Op[] {
  return bandExists(read, band) ? [] : [bandCreateOp(band)];
}

/** Activating a band row, whole: author the band if it is missing, then select
 * it so the tree and the property panel both confirm what happened. The ONE
 * behaviour behind both entry points (the insert menu and the layer tree's
 * placeholder row), taking the three callables rather than a controller so the
 * tree — which holds exactly these three — can call it too. The batch result
 * is narrowed to its `ok` flag so both callers' types fit (the editor
 * controller's `BatchResult` and the tree's `OpResult`).
 *
 * A refused batch (a hostile document shape) leaves the selection alone: a
 * selection pointing at a band that was not created would open the panel on
 * nothing. */
export function activateBand(
  band: BandName,
  read: ReadFn,
  applyAll: (ops: readonly Op[]) => { readonly ok: boolean },
  select: (path: string) => void,
): void {
  const ops = bandActivateOps(read, band);
  if (ops.length > 0 && !applyAll(ops).ok) {
    return;
  }
  select(bandPath(band));
}
