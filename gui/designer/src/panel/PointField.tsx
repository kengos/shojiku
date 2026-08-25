// One endpoint coordinate of a `line`, split out of `LinePointsEditor` so the
// reseed hook has a fixed home: the editor renders its four fields through a
// helper, and a hook cannot be called from inside one.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { type LinePointField, type LinePointsView, linePointOps } from './linePoints';
import { useReseedKey } from './useReseedKey';

/** Field → its label key, spelled out so every rendered key is greppable. */
const FIELD_LABELS: Readonly<Record<LinePointField, string>> = {
  'from.x': 'panel.line.fromX',
  'from.y': 'panel.line.fromY',
  'to.x': 'panel.line.toX',
  'to.y': 'panel.line.toY',
};

/** One endpoint coordinate of a line. */
export function PointField({
  name,
  view,
  path,
  controller,
}: {
  readonly name: LinePointField;
  readonly view: LinePointsView;
  readonly path: string;
  readonly controller: EditorController;
}) {
  const { t } = useI18n();
  const [inputKey, reseed] = useReseedKey(view[name]);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-sm text-muted">{t(FIELD_LABELS[name])}</span>
      <input
        // Value-keyed so undo or a selection change reseeds the field, while a
        // sibling commit leaves in-progress typing alone; plus a refusal nonce,
        // because a refused point leaves the value exactly where it was.
        key={inputKey}
        type="text"
        className="h-8 w-20 rounded-md border border-border bg-surface px-1 text-sm text-text"
        defaultValue={view[name]}
        onBlur={(event) => {
          const typed = event.currentTarget.value;
          if (typed === view[name]) {
            // An unchanged blur has nothing to take back, and remounting the
            // input would drop focus for no reason.
            return;
          }
          // Reseed after ANY committing blur. Asking whether the batch landed
          // would be the wrong question twice over: `applyAll([])` reports ok
          // and bumps the revision, so a refusal reads as success; and a
          // commit that lands without moving the value would leave the typed
          // text on screen.
          controller.applyAll(linePointOps(path, view, name, typed));
          reseed();
        }}
      />
    </label>
  );
}
