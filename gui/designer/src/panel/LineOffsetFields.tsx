// The `offset:` of one ANCHORED line endpoint: two ▲▼ fields under the
// endpoint's item/edge row, shifting the point the engine resolved on the
// target. Split out of `LinePointsEditor`, which renders it only for an
// endpoint that carries `item:` — an offset without one is a parse error.
//
// The fields are the placement tab's own stepper pair (`BoxAxisField`'s
// shape), with one difference the wire forces: the engine reads each axis as
// a bare pt NUMBER, so there is no `mm`/`cm`/`in` hint and the soft keyboard
// is the decimal one. Each commit and each ▲▼ is ONE `applyAll` batch — one
// undo step.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import {
  canStepOffset,
  lineOffsetOps,
  type OffsetAxis,
  readLineOffset,
  stepLineOffsetOps,
} from './lineOffset';
import type { LineEnd } from './linePoints';
import { StepperField } from './StepperField';

/** The ▲▼ increment while the canvas grid is off — the box steppers' own. */
const FALLBACK_STEP_PT = 1;

/** Endpoint × axis → its label key, spelled out so every key is greppable. */
const LABELS: Readonly<Record<LineEnd, Readonly<Record<OffsetAxis, string>>>> = {
  from: { x: 'panel.line.fromOffsetX', y: 'panel.line.fromOffsetY' },
  to: { x: 'panel.line.toOffsetX', y: 'panel.line.toOffsetY' },
};

export function LineOffsetFields({
  end,
  path,
  gridStep,
  controller,
}: {
  readonly end: LineEnd;
  readonly path: string;
  /** The canvas grid step (pt) — the ▲▼ increment; 0/off falls back to 1pt. */
  readonly gridStep: number;
  readonly controller: EditorController;
}) {
  const { t } = useI18n();
  const view = readLineOffset(controller.read, path, end);
  const step = gridStep > 0 ? gridStep : FALLBACK_STEP_PT;
  // Rendered only under an anchored endpoint, so every op is built as one.
  const field = (axis: OffsetAxis) => {
    // A value the engine cannot read (a `2mm` string, an `offset: 5`) has no
    // number to step from; the bubble says what the field takes instead.
    const unreadable = !view[axis].readable || view.shape === 'other';
    return (
      <StepperField
        key={axis}
        label={t(LABELS[end][axis])}
        value={view[axis].text}
        unit="pt"
        inputMode="decimal"
        placeholder="0"
        canStep={!unreadable && canStepOffset(view[axis])}
        stepHint={unreadable ? t('panel.line.offsetNumbersOnly') : undefined}
        onCommit={(raw) => controller.applyAll(lineOffsetOps(path, view, end, axis, raw, true))}
        onStep={(dir) =>
          controller.applyAll(stepLineOffsetOps(path, view, end, axis, dir, step, true))
        }
      />
    );
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {field('x')}
      {field('y')}
    </div>
  );
}
