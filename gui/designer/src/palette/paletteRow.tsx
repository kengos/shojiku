// One palette FIELD row and the chrome it carries: the localized type label,
// the used-in-template badge, and the drag arming that lets a row become a
// bound item on the canvas. Dispatches no document ops — a click hands paths
// up to the shared selection, a drag hands a payload up to the Designer.

import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { IconGear } from '../ui/icons';
import type { PaletteDragPayload } from './dragSnippet';
import { clip } from './fieldDisplay';
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
  /** Open the fullscreen data-item editor on THIS field. Absent = no gear (the
   * affordance is disarmed by the missing callback, like every other one). */
  readonly onEdit?: () => void;
}

export function FieldRow({ field, paths, onPick, group, drag, onEdit }: FieldRowProps) {
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
      <span className={`[overflow-wrap:anywhere] font-semibold${unused ? ' text-muted' : ''}`}>
        {field.label}
      </span>
      {/* Both halves wrap, and the KEY is also CLIPPED for display. It is the
          one string in this row that reached the DOM uncapped — `leafField`
          clips a title, a type and a sample, never a property path — so a long
          one painted straight out of the ~215px row. Wrapping alone would have
          traded that for the opposite failure: an unbounded key wraps to
          thousands of lines and buries the rest of the palette. `clip()` is
          this directory's own vocabulary (`caps.ts`), and the FULL key still
          goes to the drag payload and the pick op below — only the display is
          bounded. */}
      <span className="flex items-baseline gap-2 text-sm text-muted">
        <code className="text-sm [overflow-wrap:anywhere]">{clip(field.key)}</code>
        <span className="[overflow-wrap:anywhere]">
          {typeLabelKey !== undefined ? t(typeLabelKey) : field.type}
        </span>
      </span>
      {field.sample !== '' ? (
        <span className="text-sm text-muted italic [overflow-wrap:anywhere]">{field.sample}</span>
      ) : null}
      <UsageBadge count={paths.length} />
    </>
  );
  // Draggable rows show a grab cursor (and disable touch scrolling); the bound
  // button is otherwise a pointer. Choosing one cursor avoids a utility clash.
  const cursor = drag !== undefined ? 'cursor-grab touch-none' : '';
  // Both affordances are SIBLINGS of the row, never inside it: a bound row IS
  // a `<button>`, and a button inside a button is invalid HTML (the data-item
  // list row already settled this shape for its help hint). Icon-only, because
  // the palette row measures ~215px and does not fit a second text control
  // beside the field name.
  // The description folds into a `?` rather than sitting inline: the palette is
  // a SCANNING surface and a `description` is author-supplied prose of any
  // length (a shipped genkoyoshi example carries 68 characters, ~5 lines in a
  // ~215px row), so inline it pushes the usage badge off the fold and buries
  // the next field. `data/ItemListRow.tsx` — the same field row in the
  // data-item editor — already made exactly this choice; this makes the two
  // agree. The full text stays readable there, and editable in `DefinitionForm`.
  const describe =
    field.description === '' ? null : (
      <HelpHint label={t('data.field.description')} body={field.description} />
    );
  const gear =
    onEdit === undefined ? null : (
      <IconButton label={t('palette.editField')} variant="ghost" onClick={onEdit}>
        <IconGear />
      </IconButton>
    );
  // ONE centred row for both affordances, not a wrapper each. `HelpHint` is
  // 18px everywhere and `IconButton` is 36px, and each is right on its own —
  // but this is the first row where the two sit side by side, so anchoring
  // them independently put their optical centres 7px apart. `items-center`
  // is what makes a small control and a large one read as a pair.
  const affordances =
    describe === null && gear === null ? null : (
      <span className="flex shrink-0 items-center pt-1">
        {describe}
        {gear}
      </span>
    );
  return (
    <li className="flex items-start">
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
      {affordances}
    </li>
  );
}
