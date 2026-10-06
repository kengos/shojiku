// The `line` item's placement body: its two endpoints. A line has no `box`,
// so the ordinary box fields cannot express its position — and writing a
// `box:` key onto one is an engine parse error. These four fields are the
// only position a line has, and without them a line inserted from the menu
// could be re-styled but never moved.
//
// Each field dispatches ONE op = one undo step, and only for the value that
// changed, so an untouched authored form stays byte-exact.

import type { Op } from '@shojiku/designer-core';
import { type JSX, useId } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { AnchorTargetSelect } from './AnchorTargetSelect';
import { AutoNamedNote, useAutoNamed } from './AutoNamedNote';
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
} from './linePoints';
import { PointField } from './PointField';
import { useAnchorTargets } from './useAnchorTargets';

export interface LinePointsEditorProps {
  readonly view: LinePointsView;
  readonly path: string;
  readonly controller: EditorController;
  /** Engine capability keys; `undefined` = ungated (no engine to ask). */
  readonly capabilities?: readonly string[];
}

const SELECT = 'h-8 w-28 rounded-md border border-border bg-surface px-1 text-sm text-text';

/** The anchored arm's labels, spelled out for the same greppability. */
const ANCHOR_LABELS: Readonly<Record<LineAnchorField, string>> = {
  'from.item': 'panel.line.fromItem',
  'from.edge': 'panel.line.fromEdge',
  'to.item': 'panel.line.toItem',
  'to.edge': 'panel.line.toEdge',
};

export function LinePointsEditor({ view, path, controller, capabilities }: LinePointsEditorProps) {
  const { t } = useI18n();
  // The items an endpoint may name — the document's, never the preview's box
  // index, so a template with no `id:` anywhere still offers them, and picking
  // an unnamed one names it in the same batch (`ids/anchorTargets`).
  const targets = useAnchorTargets(controller, path);
  const empty = targets.candidates.length === 0;
  const baseId = useId();
  const autoNamed = useAutoNamed(path);
  // An anchored endpoint is a key an older engine rejects outright, and there
  // is no coordinate the panel could write instead — so the control is
  // withheld rather than offered hopefully.
  const canAnchor = hasCapability(capabilities, 'line.anchor');
  const field = (name: LinePointField) => (
    <PointField key={name} name={name} view={view} path={path} controller={controller} />
  );

  // Both anchored values are CLOSED sets — five keywords, and the document's
  // items — so both pick rather than type. An id is the one value a user
  // cannot guess right, and a typo here makes the line vanish.
  const labelled = (key: string, text: string, control: (id: string) => JSX.Element) => (
    <div className="flex flex-col gap-0.5" key={key}>
      <label htmlFor={`${baseId}-${key}`} className="text-sm text-muted">
        {text}
      </label>
      {control(`${baseId}-${key}`)}
    </div>
  );
  const edge = (name: LineAnchorField) =>
    labelled(name, t(ANCHOR_LABELS[name]), (id) => (
      <select
        id={id}
        className={SELECT}
        value={view[name]}
        onChange={(event) =>
          controller.applyAll(lineAnchorOps(path, view, name, event.currentTarget.value))
        }
      >
        <option value="">{t('panel.line.edgeCenter')}</option>
        {/* An authored keyword outside the set stays selectable back to. */}
        {(view[name] === '' || LINE_EDGES.includes(view[name] as (typeof LINE_EDGES)[number])
          ? LINE_EDGES
          : [...LINE_EDGES, view[name]]
        ).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ));
  // The target select, for re-picking an anchored end and for attaching a
  // coordinate one. `write` turns the picked id into the endpoint's own ops;
  // the target's naming ops run first in the same batch — one undo step.
  const target = (end: LineEnd, write: (id: string) => readonly Op[]) => (id: string) => (
    <AnchorTargetSelect
      id={id}
      targets={targets}
      value={isAnchored(view, end) ? view[`${end}.item`] : ''}
      blank={t(empty ? 'panel.line.noTargets' : 'panel.line.pickItem')}
      className={SELECT}
      onPick={(picked) => {
        controller.applyAll([...picked.ops, ...write(picked.id)]);
        autoNamed.record(end, picked);
      }}
    />
  );

  const endpoint = (end: LineEnd) => {
    const anchored = isAnchored(view, end);
    return (
      <div className="mb-1.5 flex flex-wrap items-end gap-2" key={end}>
        {anchored ? (
          <>
            {labelled(
              `${end}.item`,
              t(ANCHOR_LABELS[`${end}.item`]),
              target(end, (id) => lineAnchorOps(path, view, `${end}.item`, id)),
            )}
            {edge(`${end}.edge`)}
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
        {canAnchor &&
          !anchored &&
          // Attaching PICKS its target in the same action. Switching first
          // and asking after would write `item: ''`, and the line would
          // vanish from the canvas before the user was asked for anything.
          // Rendered whenever the engine reads the key — DISABLED with its
          // reason when nothing can be named, as the ellipse's is: a control
          // that appears and disappears reads as a bug.
          labelled(
            `${end}.attach`,
            t('panel.line.useAnchor'),
            target(end, (id) => lineArmOps(path, view, end, 'anchor', id)),
          )}
        <AutoNamedNote name={autoNamed.noteFor(end, anchored ? view[`${end}.item`] : '')} />
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
