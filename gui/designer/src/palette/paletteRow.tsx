// One palette FIELD row and the chrome it carries: the localized type label,
// the used-in-template badge, and the drag arming that lets a row become a
// bound item on the canvas. Dispatches no document ops — a click hands paths
// up to the shared selection, a drag hands a payload up to the Designer.

import { useI18n } from '../i18n/context';
import type { PaletteDragPayload } from './dragSnippet';
import type { PaletteField } from './model';

/** The palette side of the Designer-owned drag: `begin` arms a drag with the
 * field-or-group payload; move/up/cancel feed the same pointer stream; a
 * completed drag's trailing click is consumed so it does not also cycle. */
export interface PaletteDrag {
  readonly begin: (payload: PaletteDragPayload, event: React.PointerEvent<Element>) => void;
  readonly move: (event: React.PointerEvent<Element>) => void;
  readonly up: (event: React.PointerEvent<Element>) => void;
  readonly cancel: () => void;
  readonly consumeClick: () => boolean;
}

/** The engine's `FieldType` wire names, each with a localized display label.
 * An unknown type string (garbage definitions) displays verbatim instead.
 * Shared with the property panel's binding field picker. */
export const TYPE_LABEL_KEYS: ReadonlyMap<string, string> = new Map(
  [
    'string',
    'number',
    'currency',
    'datetime',
    'date',
    'quantity',
    'percentage',
    'boolean',
    'image',
  ].map((name) => [name, `palette.type.${name}`]),
);

interface UsageBadgeProps {
  readonly count: number;
}

export function UsageBadge({ count }: UsageBadgeProps) {
  const { t } = useI18n();
  return (
    <span className={`text-sm ${count > 0 ? 'text-accent' : 'text-muted'}`}>
      {count > 0 ? t('palette.used', { count }) : t('palette.unused')}
    </span>
  );
}

/** A palette field row (button when bound, div when unused). Kept marker class
 * `sj-palette-field` (test hook); the drag/used variants add utilities. */
const PALETTE_FIELD =
  'sj-palette-field flex w-full flex-col gap-px rounded-md border-0 bg-transparent px-2 py-1 text-left';

interface FieldRowProps {
  readonly field: PaletteField;
  readonly paths: readonly string[];
  readonly onPick: (paths: readonly string[]) => void;
  /** The owning ARRAY group's id, or `null` for a document-scope field — it
   * rides the drag payload, which is what decides where the row may land. */
  readonly group: string | null;
  /** Drag wiring for this row; absent = not draggable. */
  readonly drag?: PaletteDrag;
}

export function FieldRow({ field, paths, onPick, group, drag }: FieldRowProps) {
  const { t } = useI18n();
  const typeLabelKey = TYPE_LABEL_KEYS.get(field.type);
  // The pointer handlers arm a Designer-owned drag; a plain click (below the
  // drag threshold) still picks/cycles, and a completed drag's trailing click
  // is consumed upstream.
  const dragProps =
    drag === undefined
      ? {}
      : {
          onPointerDown: (event: React.PointerEvent<Element>) =>
            drag.begin(
              {
                kind: 'field',
                field: { key: field.key, type: field.type, label: field.label, group },
              },
              event,
            ),
          onPointerMove: drag.move,
          onPointerUp: drag.up,
          onPointerCancel: drag.cancel,
        };
  const unused = paths.length === 0;
  const body = (
    <>
      <span className={unused ? 'font-semibold text-muted' : 'font-semibold'}>{field.label}</span>
      <span className="flex items-baseline gap-2 text-sm text-muted">
        <code className="text-sm">{field.key}</code>
        <span>{typeLabelKey !== undefined ? t(typeLabelKey) : field.type}</span>
      </span>
      {field.description !== '' ? (
        <span className="text-sm text-muted [overflow-wrap:anywhere]">{field.description}</span>
      ) : null}
      {field.sample !== '' ? (
        <span className="text-sm text-muted italic [overflow-wrap:anywhere]">{field.sample}</span>
      ) : null}
      <UsageBadge count={paths.length} />
    </>
  );
  // Draggable rows show a grab cursor (and disable touch scrolling); the bound
  // button is otherwise a pointer. Choosing one cursor avoids a utility clash.
  const cursor = drag !== undefined ? 'cursor-grab touch-none' : '';
  return (
    <li>
      {paths.length > 0 ? (
        <button
          type="button"
          className={`${PALETTE_FIELD} hover:bg-bg ${cursor === '' ? 'cursor-pointer' : cursor}`}
          onClick={() => {
            if (drag?.consumeClick() === true) {
              return;
            }
            onPick(paths);
          }}
          {...dragProps}
        >
          {body}
        </button>
      ) : (
        <div className={`${PALETTE_FIELD} ${cursor}`} {...dragProps}>
          {body}
        </div>
      )}
    </li>
  );
}
