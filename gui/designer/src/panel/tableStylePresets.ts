// The style GALLERY: Excel's table-style thumbnails, transposed onto the six
// looks a business form actually asks for. Picking one is the whole interaction
// for a user who never wants to choose a colour — the point of the idiom.
//
// A preset OWNS a fixed set of keys and nothing else. Applying it authors the
// values it declares and REMOVES the owned keys it does not, in one batch (one
// undo step), so switching presets cannot leave a previous one's fill behind.
// Keys outside that set — an alignment, a text colour, a row base fill the user
// set by hand — are never touched, which is what lets the gallery and the detail
// controls coexist.
//
// Lookup goes through a `Map`, never a plain-object index: a preset id is a
// string reaching this module from a click handler, and a `Record` lookup walks
// the prototype, so `constructor` would return an inherited function.

import type { Op } from '@shojiku/designer-core';
import type { TableStyleView } from './tableStyleModel';

/** The keys a preset may set, as (band-ish) key paths under the table node. The
 * gallery's whole contract is that it writes these and only these. */
const OWNED_KEYS = [
  ['header', 'style', 'backgroundColor'],
  ['header', 'style', 'color'],
  ['header', 'style', 'fontWeight'],
  ['row', 'alternateStyle', 'backgroundColor'],
  ['style', 'borderWidth'],
] as const;

type OwnedKey = (typeof OWNED_KEYS)[number];

/** What one preset declares. An absent entry means "remove that key", which is
 * how `plain` differs from a preset that paints white. */
export interface TablePreset {
  readonly id: string;
  /** Declared values, keyed by the owned key path joined with `.`. */
  readonly values: Readonly<Record<string, string | number>>;
}

const key = (path: OwnedKey): string => path.join('.');

const HEADER_FILL = key(OWNED_KEYS[0]);
const HEADER_COLOR = key(OWNED_KEYS[1]);
const HEADER_WEIGHT = key(OWNED_KEYS[2]);
const ZEBRA_FILL = key(OWNED_KEYS[3]);
const GRID_WIDTH = key(OWNED_KEYS[4]);

/** The six looks, in gallery order. `plain` declares nothing: the engine's own
 * defaults (a `#ededed` header, a 0.5pt grid) already ARE the standard look, so
 * the honest way to offer it is to author nothing at all. */
export const TABLE_PRESETS: readonly TablePreset[] = [
  { id: 'plain', values: {} },
  { id: 'striped', values: { [ZEBRA_FILL]: '#f6f8fa' } },
  {
    id: 'darkHeader',
    values: { [HEADER_FILL]: '#374151', [HEADER_COLOR]: '#ffffff', [HEADER_WEIGHT]: 'bold' },
  },
  { id: 'tintStriped', values: { [HEADER_FILL]: '#dbe7ff', [ZEBRA_FILL]: '#f6f8fa' } },
  { id: 'borderless', values: { [ZEBRA_FILL]: '#f6f8fa', [GRID_WIDTH]: 0 } },
  { id: 'noHeaderFill', values: { [HEADER_FILL]: '#ffffff' } },
];

const BY_ID = new Map(TABLE_PRESETS.map((preset) => [preset.id, preset]));

/** A preset by id, or `null` — including for a prototype name, which a plain
 * object lookup would answer with an inherited function. */
export function presetById(id: string): TablePreset | null {
  return BY_ID.get(id) ?? null;
}

/** The owned keys' current values, read out of the section's view rather than
 * re-walking the node — one place decides what the document says. */
function currentValues(view: TableStyleView, gridWidth: string): Record<string, string> {
  return {
    [HEADER_FILL]: view.header.backgroundColor,
    [HEADER_COLOR]: view.header.color,
    [HEADER_WEIGHT]: view.header.fontWeight,
    [ZEBRA_FILL]: view.zebra,
    [GRID_WIDTH]: gridWidth,
  };
}

/** Which preset the table currently matches, or `null` for a hand-tuned table
 * ("custom"). Derived from the WIRE every render — the gallery holds no
 * selection state of its own, so an undo or an external edit is reflected. */
export function matchPreset(view: TableStyleView, gridWidth: string): string | null {
  const current = currentValues(view, gridWidth);
  for (const preset of TABLE_PRESETS) {
    const same = OWNED_KEYS.every((path) => {
      const k = key(path);
      const declared = preset.values[k];
      return current[k] === (declared === undefined ? '' : String(declared));
    });
    if (same) {
      return preset.id;
    }
  }
  return null;
}

/** The batch that makes the table look like this preset: set what it declares,
 * remove the owned keys it does not, skip the ones already correct so the diff
 * stays minimal. `[]` for an unknown id — a click that authors nothing beats a
 * click that authors a prototype's name. */
export function presetOps(
  tablePath: string,
  view: TableStyleView,
  gridWidth: string,
  id: string,
): readonly Op[] {
  const preset = presetById(id);
  if (preset === null) {
    return [];
  }
  const current = currentValues(view, gridWidth);
  const ops: Op[] = [];
  for (const path of OWNED_KEYS) {
    const k = key(path);
    const declared = preset.values[k];
    const keys = [...path];
    if (declared === undefined) {
      if (current[k] !== '') {
        ops.push({ op: 'removeKey', path: tablePath, keys });
      }
    } else if (current[k] !== String(declared)) {
      ops.push({ op: 'setScalar', path: tablePath, keys, value: declared });
    }
  }
  return ops;
}
