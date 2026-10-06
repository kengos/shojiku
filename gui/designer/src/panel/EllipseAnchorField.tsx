// The `ellipse`'s anchor control, on the PLACEMENT tab because anchoring IS its
// placement: an anchored oval takes its position from the item it circles, and
// the engine stops reading `box.x`/`box.y` entirely. That is why the field sits
// beside the box fields rather than with the paint — and why, while it is
// anchored, this says so instead of leaving four coordinate boxes on screen that
// nothing reads. `canvas/manipulate` already refuses the drag for the same
// reason; this is the panel saying the same thing in words.
//
// The target is PICKED from the document's items (`useAnchorTargets` →
// `AnchorTargetSelect`), never typed: a typo would make the oval vanish. An
// item with no `id:` is offered too, and picking it names it in the same batch
// as the anchor (`ids/anchorTargets`), so one undo step removes both.

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { AnchorTargetSelect } from './AnchorTargetSelect';
import { AutoNamedNote, useAutoNamed } from './AutoNamedNote';
import { attachAnchorOps, detachAnchorOp, readEllipseAnchor } from './ellipseAnchor';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { useAnchorTargets } from './useAnchorTargets';

const SELECT = 'h-8 w-full rounded-md border border-border bg-surface px-1 text-sm text-text';

/** Self-gating: `null` for anything that is not an ellipse, so the placement
 * tab renders it unconditionally and this file owns the whole question. */
export function EllipseAnchorField(props: ItemPanelProps) {
  // A component of its own below, so the namespace hook runs for ellipses only.
  return props.view.type === 'ellipse' ? <EllipseAnchor {...props} /> : null;
}

function EllipseAnchor(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, capabilities } = props;
  const targets = useAnchorTargets(controller, path);
  const selectId = useId();
  const autoNamed = useAutoNamed(path);
  const view = readEllipseAnchor(controller.read, path);
  const select = (
    <AnchorTargetSelect
      id={selectId}
      targets={targets}
      value={view.anchor}
      blank={t(
        targets.candidates.length === 0 ? 'panel.ellipse.noTargets' : 'panel.ellipse.pickItem',
      )}
      className={SELECT}
      // Attaching PICKS its target in the same action: switching arms first
      // would write `anchor: ''`, which resolves to no item, and the oval would
      // vanish before the user was asked for anything.
      onPick={(picked) => {
        controller.applyAll([...picked.ops, ...attachAnchorOps(path, picked.id, view)]);
        autoNamed.record('anchor', picked);
      }}
    />
  );

  if (view.anchored) {
    return (
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-0.5">
          <label htmlFor={selectId} className="text-sm text-muted">
            {t('panel.ellipse.circling')}
          </label>
          {select}
        </div>
        <button
          type="button"
          className="h-8 rounded-md border border-border px-2 text-sm text-muted"
          onClick={() => applyPanelOp(controller, detachAnchorOp(path))}
        >
          {t('panel.ellipse.detach')}
        </button>
        <p className="m-0 w-full text-muted text-xs">{t('panel.ellipse.anchoredHint')}</p>
        <AutoNamedNote name={autoNamed.noteFor('anchor', view.anchor)} />
      </div>
    );
  }
  // An older engine parse-REJECTS `anchor:`, so the offer is withheld rather
  // than made hopefully. Reading an already-anchored file is NOT gated: above,
  // the arm renders from the wire.
  if (!hasCapability(capabilities, 'ellipse.anchor')) {
    return null;
  }
  // Nothing to offer means the document has no item an oval can circle (every
  // other item repeats, is anchored itself, or is not one placement). The row
  // stays VISIBLE and DISABLED with that reason rather than becoming a bare
  // sentence — the band-only page-number shape, and for its reason: a control
  // that appears and disappears reads as a bug, and so does a sentence with no
  // control.
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      <label htmlFor={selectId} className="text-sm text-muted">
        {t('panel.ellipse.circle')}
      </label>
      {select}
    </div>
  );
}
