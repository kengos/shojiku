// The form the flowing body opens when it is selected in the layer tree (it used
// to open the ordinary item panel, whose name field could write an `id:` the
// body does not take — a document that then no longer parses). It holds what the
// body itself decides: whether items flow down the pages or sit at their own
// coordinates (`bodyModel` builds both switches), and for a flowing body the
// space between items (`gap`) and the region it flows in (`box`, relative to
// the page margins — empty is the whole area inside the margins).
//
// A switch to placed items asks first when something cannot come along, saying
// how many items are drawn only after page 1 and how many are kinds a placed
// body skips; it is disabled, with the reason, until the preview has caught up
// with the document, since the positions it pins come from that preview.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { Button } from '../ui/Button';
import { PANEL, SECTION_TITLE } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import { Segmented } from '../ui/Segmented';
import { BodyRegionFields } from './BodyRegionFields';
import { toFlowOps } from './bodyFlow';
import {
  type AbsoluteLoss,
  type AbsolutePlan,
  BODY_PATH,
  bodyMode,
  toAbsoluteOps,
} from './bodyModel';

/** The confirm's lines, in reading order — each key is also its string's. */
const LOSS_LINES: readonly (keyof AbsoluteLoss)[] = [
  'pastFirstPage',
  'continued',
  'unplaced',
  'flowOnly',
  'tablePaging',
];

import type { PlacementGeometry } from './placementGeometry';

export function BodyForm({
  controller,
  geometry,
}: {
  readonly controller: EditorController;
  readonly geometry: PlacementGeometry | null;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState<AbsolutePlan | null>(null);
  const mode = bodyMode(controller.read);
  const toAbsolute = mode === 'flow' ? toAbsoluteOps(controller.read, geometry) : null;
  const toFlow = mode === 'absolute' ? toFlowOps(controller.read) : null;
  // Why the OTHER mode cannot be picked, if it cannot: too many items for one
  // batch (either way), or no fresh preview to pin from (to fixed position).
  const blocked =
    toAbsolute === 'tooMany' || toFlow === 'tooMany'
      ? t('panel.body.mode.tooMany')
      : mode === 'flow' && toAbsolute === null
        ? t('panel.body.mode.waitPreview')
        : undefined;
  const pick = (value: string) => {
    // A blocked option never fires, so the plan for the picked side is there.
    if (value === 'flow') {
      controller.applyAll(toFlow as Op[]);
      return;
    }
    const plan = toAbsolute as AbsolutePlan;
    if (Object.values(plan.loss).some((count) => count > 0)) {
      setPending(plan);
      return;
    }
    controller.applyAll(plan.ops);
  };
  // What the confirm lists (nothing while it is closed).
  const loss = pending?.loss;
  // Only reachable from the open confirm, which only opens over a plan.
  const confirm = () => {
    controller.applyAll((pending as AbsolutePlan).ops);
    setPending(null);
  };
  return (
    <aside className={PANEL} aria-label={t('panel.title')}>
      <section>
        <h3 className={SECTION_TITLE}>{t('panel.body.title')}</h3>
        {mode === null ? null : (
          <Segmented
            ariaLabel={t('panel.body.mode')}
            value={mode}
            options={[
              {
                value: 'flow',
                label: t('panel.body.mode.flow'),
                disabled: mode === 'absolute' && blocked !== undefined,
                tip: mode === 'absolute' ? blocked : undefined,
              },
              {
                value: 'absolute',
                label: t('panel.body.mode.absolute'),
                disabled: mode === 'flow' && blocked !== undefined,
                tip: mode === 'flow' ? blocked : undefined,
              },
            ]}
            onChange={pick}
          />
        )}
        <p className="mt-0 mb-2 text-[11px] text-muted leading-relaxed">
          {t(mode === 'absolute' ? 'panel.body.mode.absoluteHint' : 'panel.body.mode.flowHint')}
        </p>
        {mode === 'flow' ? <BodyRegionFields controller={controller} path={BODY_PATH} /> : null}
      </section>
      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('panel.body.toAbsolute.title')}
        closeLabel={t('help.close')}
        footer={
          <>
            <Button onClick={() => setPending(null)}>{t('panel.body.toAbsolute.cancel')}</Button>
            <Button variant="primary" onClick={confirm}>
              {t('panel.body.toAbsolute.confirm')}
            </Button>
          </>
        }
      >
        {/* One line per change that HAPPENS: a zero count is not a warning. */}
        {LOSS_LINES.map((key) =>
          loss !== undefined && loss[key] > 0 ? (
            <p key={key} className="m-0">
              {t(`panel.body.toAbsolute.${key}`, { count: loss[key] })}
            </p>
          ) : null,
        )}
        <p className="mt-2 mb-0">{t('panel.body.toAbsolute.undo')}</p>
      </Modal>
    </aside>
  );
}
