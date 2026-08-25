// The `line` item's own stroke cluster. A line is the one shape that did NOT
// converge onto the unified `Style` — its stroke lives in `style.width` /
// `style.color` / `style.style`, not `borderWidth`/`borderColor`/`borderStyle`
// — so the border cluster (which is map-aware and per-side) cannot edit it and
// this small dedicated editor does. It exists because the insert menu can
// CREATE a line (the cut-here line scaffold): an insertable kind with no editing
// surface is a dead end.
//
// Each control dispatches ONE op = one undo step, and writes only the property
// that changed, so an untouched authored form stays byte-exact.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, SELECT_SM } from '../ui/chrome';
import { BORDER_STYLE_VALUES, type BorderStyleValue, PATTERNED_BORDER_STYLES } from './borderTypes';
import { type LineStyleView, lineStyleOps } from './lineModel';
import { useReseedKey } from './useReseedKey';

export interface LineStyleEditorProps {
  readonly view: LineStyleView;
  readonly path: string;
  readonly controller: EditorController;
  readonly capabilities?: readonly string[];
}

export function LineStyleEditor({ view, path, controller, capabilities }: LineStyleEditorProps) {
  const { t } = useI18n();
  const [widthKey, reseedWidth] = useReseedKey(view.width);
  // An older engine parse-rejects every `style:` keyword on a line, so the
  // whole picker is gated — not just the patterned options.
  const styleControl = capabilities === undefined || capabilities.includes('line.style');
  const patterned =
    capabilities === undefined || capabilities.includes('style.borderStyle.dashed_dotted');
  const choices = BORDER_STYLE_VALUES.filter(
    (value) => patterned || !PATTERNED_BORDER_STYLES.includes(value),
  );

  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.field.line')}</span>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t('border.penWidth')}</span>
          <input
            // Value-keyed so undo / a selection change reseeds the field while
            // a sibling commit leaves in-progress typing alone; plus a refusal
            // nonce, since a refused width leaves the value untouched.
            key={widthKey}
            type="text"
            className="h-8 w-20 rounded-md border border-border bg-surface px-1 text-sm text-text"
            defaultValue={view.width}
            placeholder="1"
            onBlur={(event) => {
              const typed = event.currentTarget.value;
              if (typed === view.width) {
                return;
              }
              // Reseed after ANY committing blur — see `PointField` for why
              // neither the batch result nor its emptiness is the right signal.
              // A CLAMPED width (over the cap) lands without moving the value,
              // and would otherwise leave the typed number on screen.
              controller.applyAll(lineStyleOps(path, view, { width: typed }));
              reseedWidth();
            }}
          />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{t('border.penColor')}</span>
          <ColorSwatchPicker
            label={t('border.penColor')}
            value={view.color}
            onCommit={(color) => controller.applyAll(lineStyleOps(path, view, { color }))}
            triggerClassName="inline-flex h-8 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:border-muted"
            customLabel={t('toolbar.color.custom')}
            clearLabel={t('toolbar.color.clear')}
          />
        </div>
        {styleControl ? (
          <label className="flex flex-col gap-0.5">
            <span className="text-sm text-muted">{t('border.penStyle')}</span>
            <select
              className={SELECT_SM}
              value={view.style}
              onChange={(event) => {
                // Capture synchronously — `currentTarget` is null inside the
                // deferred dispatch.
                const style = event.currentTarget.value as BorderStyleValue;
                controller.applyAll(lineStyleOps(path, view, { style }));
              }}
            >
              {choices.map((value) => (
                <option key={value} value={value}>
                  {t(`border.style.${value}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
