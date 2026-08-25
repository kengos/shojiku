// The grid column/row cluster of the child-layout section: each ±1 (or a typed count)
// runs one applyAll batch (`gridColumnsPlan`/`gridRowsPlan`) — a grow adds
// placeholder cells, a shrink drops trailing cells. A shrink that would drop
// CONTENT-bearing cells is held behind a confirm; an all-placeholder shrink
// applies silently (undo reverts either in one step). Chrome vocabulary:
// plain column/row words — never CSS jargon.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { type GridPlan, gridColumnsPlan, gridRowsPlan } from './gridStructure';
import { StepperField } from './StepperField';

export function GridSteppers({
  controller,
  path,
  columns,
  rows,
}: {
  readonly controller: EditorController;
  readonly path: string;
  readonly columns: number;
  readonly rows: number;
}) {
  const { t } = useI18n();
  const defaultText = t('insert.defaultText');
  const [pending, setPending] = useState<readonly Op[] | null>(null);

  const run = (plan: GridPlan) => {
    if (plan.ops.length === 0) {
      return;
    }
    if (plan.drops) {
      setPending(plan.ops);
      return;
    }
    controller.applyAll(plan.ops);
  };
  const resolve = (ops: readonly Op[] | null) => {
    if (ops !== null) {
      controller.applyAll(ops);
    }
    setPending(null);
  };
  const commit = (build: (n: number) => GridPlan) => (raw: string) => {
    // A cleared field is a non-commit, not a count: `Number('')` is 0, which
    // would clamp to 1 and silently collapse the grid on a mere blur. Nothing
    // here needs to report that: `StepperField` reseeds after every committing
    // blur, so an entry this drops — or one that merely ROUNDS to the current
    // count, leaving an empty plan — comes off the screen either way. That is
    // also why the typed-then-CANCELLED shrink no longer needs a nonce of its
    // own: the blur reseeded the field before the confirm was ever answered.
    const trimmed = raw.trim();
    if (trimmed === '') {
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      run(build(Math.round(n)));
    }
  };
  const colsPlan = (n: number) => gridColumnsPlan(controller.read, path, n, defaultText);
  const rowsPlan = (n: number) => gridRowsPlan(controller.read, path, n, defaultText);

  return (
    <>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <StepperField
          label={t('panel.layout.columns')}
          value={String(columns)}
          canStep
          onCommit={commit(colsPlan)}
          onStep={(dir) => run(colsPlan(columns + dir))}
        />
        <StepperField
          label={t('panel.layout.rows')}
          value={String(rows)}
          canStep
          onCommit={commit(rowsPlan)}
          onStep={(dir) => run(rowsPlan(rows + dir))}
        />
      </div>
      <Modal
        open={pending !== null}
        onClose={() => resolve(null)}
        title={t('panel.layout.shrinkConfirm.title')}
        closeLabel={t('help.close')}
        footer={
          <>
            <Button onClick={() => resolve(null)}>{t('panel.layout.shrinkConfirm.cancel')}</Button>
            <Button variant="primary" onClick={() => resolve(pending)}>
              {t('panel.layout.shrinkConfirm.confirm')}
            </Button>
          </>
        }
      >
        <p className="m-0">{t('panel.layout.shrinkConfirm.body')}</p>
      </Modal>
    </>
  );
}
