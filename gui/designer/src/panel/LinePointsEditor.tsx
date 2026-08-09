// The `line` item's placement body: its two endpoints. A line has no `box`,
// so the ordinary box fields cannot express its position — and writing a
// `box:` key onto one is an engine parse error. These four fields are the
// only position a line has, and without them a line inserted from the menu
// could be re-styled but never moved.
//
// Each field dispatches ONE op = one undo step, and only for the value that
// changed, so an untouched authored form stays byte-exact.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { type LinePointField, type LinePointsView, linePointOps } from './linePoints';

export interface LinePointsEditorProps {
  readonly view: LinePointsView;
  readonly path: string;
  readonly controller: EditorController;
}

/** Field → its label key, spelled out so every rendered key is greppable. */
const FIELD_LABELS: Readonly<Record<LinePointField, string>> = {
  'from.x': 'panel.line.fromX',
  'from.y': 'panel.line.fromY',
  'to.x': 'panel.line.toX',
  'to.y': 'panel.line.toY',
};

export function LinePointsEditor({ view, path, controller }: LinePointsEditorProps) {
  const { t } = useI18n();
  const field = (name: LinePointField) => (
    <label className="flex flex-col gap-0.5" key={name}>
      <span className="text-sm text-muted">{t(FIELD_LABELS[name])}</span>
      <input
        // Value-keyed so undo or a selection change reseeds the field, while a
        // sibling commit leaves in-progress typing alone.
        key={view[name]}
        type="text"
        className="h-8 w-20 rounded-md border border-border bg-surface px-1 text-sm text-text"
        defaultValue={view[name]}
        onBlur={(event) =>
          controller.applyAll(linePointOps(path, view, name, event.currentTarget.value))
        }
      />
    </label>
  );

  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.line.points')}</span>
      <div className="flex flex-wrap items-end gap-2">
        {field('from.x')}
        {field('from.y')}
        {field('to.x')}
        {field('to.y')}
      </div>
      <p className="mt-1.5 mb-0 text-muted text-xs">{t('panel.line.pointsHint')}</p>
    </div>
  );
}
