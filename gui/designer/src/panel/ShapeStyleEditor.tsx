// A form mark's paint cluster (`ellipse` / `checkbox`): one outline width, one
// outline colour, one fill. The `LineStyleEditor` shape, for the `LineStyleEditor`
// reason — the insert menu can CREATE these, and an insertable kind with no
// editing surface is a dead end — and deliberately NOT the border cluster: a mark
// strokes one closed path, so three of the four things that editor authors do
// not reach it. Two warn (`shape_border_sides_ignored` for a per-side map,
// `border_radius_ignored` for the corner radius) and the third, `borderStyle`,
// is silently inert — see `shapeStyle.ts` for where each is decided.
//
// The width field states the engine's default rather than leaving an empty box:
// unset is a 1 pt outline, not "no outline", and `0` is what turns it off. Those
// are opposite meanings for two states that would otherwise both read as blank.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL } from '../ui/chrome';
import { applyPanelOp } from './model';
import {
  DEFAULT_MARK_STROKE_PT,
  fillOp,
  type ShapeStyleView,
  strokeColorOp,
  strokeWidthOp,
} from './shapeStyle';
import { useReseedKey } from './useReseedKey';

export interface ShapeStyleEditorProps {
  readonly view: ShapeStyleView;
  readonly path: string;
  readonly controller: EditorController;
}

export function ShapeStyleEditor({ view, path, controller }: ShapeStyleEditorProps) {
  const { t } = useI18n();
  const [widthKey, reseedWidth] = useReseedKey(view.strokeWidth);

  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.field.shapeStroke')}</span>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t('border.penWidth')}</span>
          <input
            // Value-keyed plus a reseed nonce: a REFUSED width (non-numeric,
            // negative, past the engine's bound) authors nothing and so never
            // moves the value, which would otherwise strand the typed number on
            // screen over a document that never took it.
            key={widthKey}
            type="text"
            className="h-8 w-20 rounded-md border border-border bg-surface px-1 text-sm text-text"
            defaultValue={view.strokeWidth}
            // The DEFAULT, not a hint to type something: an empty field draws a
            // 1 pt outline.
            placeholder={DEFAULT_MARK_STROKE_PT}
            onBlur={(event) => {
              const typed = event.currentTarget.value;
              if (typed === view.strokeWidth) {
                return;
              }
              // `widthFromStyle` set means the shown value is not this item's,
              // so an empty field has nothing of its own to clear.
              applyPanelOp(controller, strokeWidthOp(path, typed, view.widthFromStyle === null));
              reseedWidth();
            }}
          />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t('border.penColor')}</span>
          <ColorSwatchPicker
            label={t('border.penColor')}
            value={view.strokeColor}
            onCommit={(color) => applyPanelOp(controller, strokeColorOp(path, color))}
            triggerClassName="inline-flex h-8 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:border-muted"
            customLabel={t('toolbar.color.custom')}
            clearLabel={t('toolbar.color.clear')}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t('panel.field.backgroundColor')}</span>
          <ColorSwatchPicker
            label={t('panel.field.backgroundColor')}
            value={view.fill}
            onCommit={(color) => applyPanelOp(controller, fillOp(path, color))}
            triggerClassName="inline-flex h-8 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:border-muted"
            customLabel={t('toolbar.color.custom')}
            clearLabel={t('toolbar.color.clear')}
          />
        </div>
      </div>
      {view.widthFromStyle === null ? null : (
        // The width came from a named style, not from this item — so the number
        // in the field above is not this item's to clear, and saying which
        // style it belongs to is what stops the reader concluding the field is
        // broken when clearing it does nothing.
        <p className="m-0 mt-1 text-muted text-xs">
          {t('panel.shape.widthFromStyle', { name: view.widthFromStyle })}
        </p>
      )}
    </div>
  );
}
