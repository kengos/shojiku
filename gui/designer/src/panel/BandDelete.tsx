// Removing a header or footer band. The band was creatable (Insert menu, the
// tree's placeholder rows) and editable (`BandForm`) but never removable, so a
// band added by mistake stayed in the file. The delete is the band's own
// button, not the Delete key: a band is a SECTION, not a list entry, and every
// list-entry delete path stays as it is. A band holding items asks first,
// saying how many go with it (the impact scope before a shared edit); an empty
// band goes at once. Either way it is one `removeKey` — one undo brings it back
// with everything in it — and the selection is cleared, since the node it
// named is gone.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { BandName } from '../insert/bandCreate';
import { Button } from '../ui/Button';
import { BTN_SM } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import { readItem } from './placementModel';

/** The op that removes the band. */
export function bandDeleteOp(band: BandName): Op {
  return { op: 'removeKey', keys: ['sections', band] };
}

/** How many items the band holds (0 for a hostile or missing list). */
export function bandItemCount(controller: EditorController, path: string): number {
  const items = readItem(controller.read, path)?.items;
  return Array.isArray(items) ? items.length : 0;
}

export function BandDelete({
  controller,
  path,
  band,
}: {
  readonly controller: EditorController;
  readonly path: string;
  readonly band: BandName;
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const count = bandItemCount(controller, path);
  const remove = () => {
    setAsking(false);
    if (controller.apply(bandDeleteOp(band)).ok) {
      controller.clearSelection();
    }
  };
  return (
    <>
      <button
        type="button"
        className={`${BTN_SM} mt-3`}
        onClick={() => (count > 0 ? setAsking(true) : remove())}
      >
        {t(`panel.band.delete.${band}`)}
      </button>
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title={t(`panel.band.delete.${band}`)}
        closeLabel={t('help.close')}
        footer={
          <>
            <Button onClick={() => setAsking(false)}>{t('panel.band.delete.cancel')}</Button>
            <Button variant="primary" onClick={remove}>
              {t('panel.band.delete.confirm')}
            </Button>
          </>
        }
      >
        <p className="m-0">{t('panel.band.delete.body', { count })}</p>
      </Modal>
    </>
  );
}
