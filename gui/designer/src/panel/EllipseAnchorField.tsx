// The `ellipse`'s anchor control, on the PLACEMENT tab because anchoring IS its
// placement: an anchored oval takes its position from the item it circles, and
// the engine stops reading `box.x`/`box.y` entirely. That is why the field sits
// beside the box fields rather than with the paint — and why, while it is
// anchored, this says so instead of leaving four coordinate boxes on screen that
// nothing reads. `canvas/manipulate` already refuses the drag for the same
// reason; this is the panel saying the same thing in words.
//
// The target is a CLOSED set read from the box index (`anchorTargets`), so the
// list is exactly what the engine can resolve — an id with no placement would
// only produce `anchor_unknown_target`, and a typo would make the oval vanish.

import { useI18n } from '../i18n/context';
import { anchorTargets, readItemId } from './anchorTargets';
import { anchorLabel, attachAnchorOps, detachAnchorOp, readEllipseAnchor } from './ellipseAnchor';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';

const SELECT = 'h-8 w-full rounded-md border border-border bg-surface px-1 text-sm text-text';

/** Self-gating: `null` for anything that is not an ellipse, so the placement
 * tab renders it unconditionally and this file owns the whole question. */
export function EllipseAnchorField(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view: item, capabilities, geometry } = props;
  if (item.type !== 'ellipse') {
    return null;
  }
  const view = readEllipseAnchor(controller.read, path);
  const targets = anchorTargets(geometry?.boxes.pages, readItemId(controller.read, path));

  if (view.anchored) {
    return (
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t('panel.ellipse.circling')}</span>
          <select
            className={SELECT}
            value={view.anchor}
            onChange={(event) =>
              controller.applyAll(attachAnchorOps(path, event.currentTarget.value, view))
            }
          >
            {/* An id the box index does not report still has to be selectable
                back to, or the field would silently re-point the oval on any
                edit — the `LinePointsEditor` rule. */}
            {(targets.includes(view.anchor) ? targets : [...targets, view.anchor]).map((id) => (
              <option key={id} value={id}>
                {anchorLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="h-8 rounded-md border border-border px-2 text-sm text-muted"
          onClick={() => applyPanelOp(controller, detachAnchorOp(path))}
        >
          {t('panel.ellipse.detach')}
        </button>
        <p className="m-0 w-full text-muted text-xs">{t('panel.ellipse.anchoredHint')}</p>
      </div>
    );
  }
  // An older engine parse-REJECTS `anchor:` outright, so the offer is withheld
  // rather than made hopefully. Reading an already-anchored file is NOT gated:
  // above, the arm renders from the wire.
  if (!hasCapability(capabilities, 'ellipse.anchor')) {
    return null;
  }
  // Nothing to OFFER, which has two causes and the copy must not pick one: no
  // placed item carries an `id:`, OR nothing has been placed yet. `targets`
  // comes from the box index of the last-good PREVIEW (`geometry` is null until
  // the first render carrying inspect), so a document full of ids reads as
  // empty until that render lands — and permanently while the template is in a
  // state that does not render, which is exactly when someone is in this panel.
  // Hence 「囲める要素がまだありません」 (nothing to circle YET) rather than a
  // claim about ids.
  //
  // The row stays VISIBLE and DISABLED with its reason rather than becoming a
  // bare sentence — the band-only page-number shape, and for its reason: a
  // control that appears and disappears reads as a bug, and so does a sentence
  // with no control.
  const empty = targets.length === 0;
  return (
    <label className="mb-2 flex flex-col gap-0.5">
      <span className="text-sm text-muted">{t('panel.ellipse.circle')}</span>
      {/* Attaching PICKS its target in the same action: switching arms first
          would write `anchor: ''`, which resolves to no item, and the oval would
          vanish before the user was asked for anything. */}
      <select
        className={SELECT}
        value=""
        disabled={empty}
        onChange={(event) =>
          controller.applyAll(attachAnchorOps(path, event.currentTarget.value, view))
        }
      >
        <option value="">{t(empty ? 'panel.ellipse.noTargets' : 'panel.ellipse.pickItem')}</option>
        {targets.map((id) => (
          <option key={id} value={id}>
            {anchorLabel(id)}
          </option>
        ))}
      </select>
    </label>
  );
}
