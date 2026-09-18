// One all-sides padding field over `paddingModel`: a pt stepper for the uniform
// form, with a line under it when the document says something the stepper does
// not show (a per-side map, or a form it cannot seed) — typing then replaces it,
// and the line says so before it happens. Path-generic: the frame form uses it
// today, and any boxed node can.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { canStepPadding, paddingOps, readPadding, stepPaddingOps } from './paddingModel';
import { StepperField } from './StepperField';

export interface PaddingFieldProps {
  readonly controller: EditorController;
  readonly path: string;
}

export function PaddingField({ controller, path }: PaddingFieldProps) {
  const { t } = useI18n();
  const view = readPadding(controller.read(path));
  const dispatch = (ops: ReturnType<typeof paddingOps>): void => {
    if (ops !== null) {
      controller.applyAll(ops);
    }
  };
  const note =
    view.mode === 'perSide'
      ? t('panel.frame.padding.perSide')
      : view.mode === 'other'
        ? t('panel.frame.padding.other')
        : null;
  return (
    <div>
      <StepperField
        label={t('panel.frame.padding')}
        value={view.text}
        unit="pt"
        placeholder="0"
        canStep={canStepPadding(view)}
        // A bare numeral is the only all-sides spelling, so the numeric keypad
        // types every value this field accepts.
        inputMode="decimal"
        onCommit={(value) => dispatch(paddingOps(path, view, value))}
        onStep={(dir) => dispatch(stepPaddingOps(path, view, dir))}
      />
      {note === null ? null : <p className="-mt-1 mb-2 text-sm text-muted">{note}</p>}
    </div>
  );
}
