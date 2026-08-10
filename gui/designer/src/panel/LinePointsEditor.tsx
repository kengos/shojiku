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
import { hasCapability } from './itemPanelProps';
import {
  isAnchored,
  LINE_EDGES,
  type LineAnchorField,
  type LineEnd,
  type LinePointField,
  type LinePointsView,
  lineAnchorOps,
  lineArmOps,
  linePointOps,
} from './linePoints';

export interface LinePointsEditorProps {
  readonly view: LinePointsView;
  readonly path: string;
  readonly controller: EditorController;
  /** Engine capability keys; `undefined` = ungated (no engine to ask). */
  readonly capabilities?: readonly string[];
  /** The ids this endpoint may anchor to, from the box index. Empty means
   * the document has no other PLACED id — the control then has nothing to
   * offer, and offering it anyway would write an id that resolves to
   * nothing. */
  readonly targets?: readonly string[];
}

/** Field → its label key, spelled out so every rendered key is greppable. */
const FIELD_LABELS: Readonly<Record<LinePointField, string>> = {
  'from.x': 'panel.line.fromX',
  'from.y': 'panel.line.fromY',
  'to.x': 'panel.line.toX',
  'to.y': 'panel.line.toY',
};

/** The anchored arm's labels, spelled out for the same greppability. */
const ANCHOR_LABELS: Readonly<Record<LineAnchorField, string>> = {
  'from.item': 'panel.line.fromItem',
  'from.edge': 'panel.line.fromEdge',
  'to.item': 'panel.line.toItem',
  'to.edge': 'panel.line.toEdge',
};

export function LinePointsEditor({
  view,
  path,
  controller,
  capabilities,
  targets = [],
}: LinePointsEditorProps) {
  const { t } = useI18n();
  // An anchored endpoint is a key an older engine rejects outright, and there
  // is no coordinate the panel could write instead — so the control is
  // withheld rather than offered hopefully.
  const canAnchor = hasCapability(capabilities, 'line.anchor');
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

  // Both anchored values are CLOSED sets — five keywords, and the ids the
  // box index reports — so both pick rather than type. An id is the one
  // value a user cannot guess right, and a typo here makes the line vanish.
  const choose = (name: LineAnchorField, options: readonly string[], blank: string) => (
    <label className="flex flex-col gap-0.5" key={name}>
      <span className="text-sm text-muted">{t(ANCHOR_LABELS[name])}</span>
      <select
        className="h-8 w-28 rounded-md border border-border bg-surface px-1 text-sm text-text"
        value={view[name]}
        onChange={(event) =>
          controller.applyAll(lineAnchorOps(path, view, name, event.currentTarget.value))
        }
      >
        <option value="">{blank}</option>
        {/* An id the panel cannot display still has to be selectable back
            to, or the field would silently re-point the line on any edit. */}
        {(view[name] === '' || options.includes(view[name])
          ? options
          : [...options, view[name]]
        ).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  const endpoint = (end: LineEnd) => {
    const anchored = isAnchored(view, end);
    return (
      <div className="mb-1.5 flex flex-wrap items-end gap-2" key={end}>
        {anchored ? (
          <>
            {choose(`${end}.item`, targets, t('panel.line.pickItem'))}
            {choose(`${end}.edge`, LINE_EDGES, t('panel.line.edgeCenter'))}
          </>
        ) : (
          <>
            {field(`${end}.x`)}
            {field(`${end}.y`)}
          </>
        )}
        {canAnchor && anchored && (
          <button
            type="button"
            className="h-8 rounded-md border border-border px-2 text-sm text-muted"
            // One transactional op list: the other arm's keys go in the same
            // undo step, so the document is never in the mixed shape.
            onClick={() => controller.applyAll(lineArmOps(path, view, end, 'xy'))}
          >
            {t('panel.line.useCoordinates')}
          </button>
        )}
        {canAnchor && !anchored && targets.length > 0 && (
          // Attaching PICKS its target in the same action. Switching first
          // and asking after would write `item: ''`, and the line would
          // vanish from the canvas before the user was asked for anything.
          <label className="flex flex-col gap-0.5">
            <span className="text-sm text-muted">{t('panel.line.useAnchor')}</span>
            <select
              className="h-8 w-28 rounded-md border border-border bg-surface px-1 text-sm text-text"
              value=""
              onChange={(event) =>
                controller.applyAll(
                  lineArmOps(path, view, end, 'anchor', event.currentTarget.value),
                )
              }
            >
              <option value="">{t('panel.line.pickItem')}</option>
              {targets.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.line.points')}</span>
      {endpoint('from')}
      {endpoint('to')}
      <p className="mt-1.5 mb-0 text-muted text-xs">{t('panel.line.pointsHint')}</p>
    </div>
  );
}
