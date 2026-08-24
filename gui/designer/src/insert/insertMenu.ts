// The insert menu's structure: which entry classes exist and which of them are
// armed for the current document. Framework-free (like panel/model.ts) so every
// rule is exhaustively unit-testable; the menu component stays thin over it.
// What each entry INSERTS lives in `insertSnippet.ts`, where it LANDS in
// `model.ts` — this module only decides what the menu offers.

import { BAND_LABEL_KEYS, BAND_NAMES, type BandName } from './bandCreate';

export type InsertKind = 'text' | 'rect' | 'qrCode' | 'pageNumber' | 'cutLine';

/** One menu row: a default-snippet element insert, the container-picker intent
 * (opens the n×m grid picker), the iterable-scaffold intent (opens the
 * dialog), the create-data-field intent (opens the field modal), or the image
 * intent (opens the file picker) — an intent row carries no snippet, the
 * Designer owns what happens next. */
export type MenuEntry =
  | { readonly kind: 'element'; readonly insert: InsertKind; readonly labelKey: string }
  | { readonly kind: 'container'; readonly labelKey: string }
  | { readonly kind: 'iterable'; readonly labelKey: string }
  | { readonly kind: 'field'; readonly labelKey: string }
  | { readonly kind: 'image'; readonly labelKey: string }
  | { readonly kind: 'paste'; readonly labelKey: string }
  // The reusable-block group (built by `blockInsertGroup`): the save-selection
  // intent (disabled without a savable selection), one row per saved block (its
  // NAME is the label, user data), and the manage intent.
  | { readonly kind: 'saveBlock'; readonly labelKey: string }
  | { readonly kind: 'block'; readonly blockId: string; readonly name: string }
  | { readonly kind: 'manageBlock'; readonly labelKey: string }
  // A repeating band: create it if the document lacks it, select it either
  // way. Deliberately NOT gated on absence — the row is the same word in both
  // states, so it never appears, disappears or greys out (Google Docs'
  // Insert → Headers & footers behaves the same).
  | { readonly kind: 'band'; readonly band: BandName; readonly labelKey: string };

export interface InsertGroup {
  readonly labelKey: string;
  readonly entries: readonly MenuEntry[];
}

/** The insert menu's structure, grouped by entry class (elements / data field /
 * list data / images). Each conditional group renders only when armed, so no
 * dead control ships: the data-field entry appears in workshop mode (a fresh
 * top-level params key is meaningful only without an engineer schema), the
 * list-data entry appears with an array group to bind (or the blank-start create
 * flow), and the image entry appears only when the host injected an image codec
 * (the browser glue that reads/downscales the file). */
export function insertMenuGroups(
  iterableArmed: boolean,
  imageArmed: boolean,
  fieldArmed: boolean,
  cutLineArmed: boolean,
): readonly InsertGroup[] {
  const groups: InsertGroup[] = [
    {
      labelKey: 'insert.group.element',
      entries: [
        { kind: 'element', insert: 'text', labelKey: 'insert.text' },
        { kind: 'element', insert: 'rect', labelKey: 'insert.rect' },
        { kind: 'element', insert: 'qrCode', labelKey: 'insert.qrCode' },
        // Band-only: the page count is known at assembly, so the engine warns
        // and skips a `page_number` anywhere else. The row stays VISIBLE and
        // disabled (with its reason) rather than vanishing — a control that
        // appears and disappears reads as a bug.
        { kind: 'element', insert: 'pageNumber', labelKey: 'insert.pageNumber' },
        // Cut-here line: a dashed rule plus its label, the business-form staple. Gated on
        // the engine understanding `line`'s `style:` — against an older
        // engine the snippet would be a parse error, not a solid line, so
        // the row is absent rather than broken.
        ...(cutLineArmed
          ? [{ kind: 'element', insert: 'cutLine', labelKey: 'insert.cutLine' } as const]
          : []),
        // The container picker is always available: a layout scaffold needs
        // no schema, so it rides the always-present element group.
        { kind: 'container', labelKey: 'insert.container' },
        // Paste-import is always available: it needs no schema and creates a
        // fresh table, so it rides the always-present element group.
        { kind: 'paste', labelKey: 'insert.paste' },
      ],
    },
  ];
  // Always armed: a band needs no schema, no host injection and no engine
  // capability — `sections.header` / `sections.footer` have been in the wire
  // since 0.1.0, and until now nothing in the UI wrote them.
  groups.push({
    labelKey: 'insert.group.band',
    entries: BAND_NAMES.map(
      (band) => ({ kind: 'band', band, labelKey: BAND_LABEL_KEYS[band] }) as const,
    ),
  });
  if (fieldArmed) {
    groups.push({
      labelKey: 'insert.group.field',
      entries: [{ kind: 'field', labelKey: 'insert.field' }],
    });
  }
  if (iterableArmed) {
    groups.push({
      labelKey: 'insert.group.listData',
      entries: [{ kind: 'iterable', labelKey: 'insert.iterable' }],
    });
  }
  if (imageArmed) {
    groups.push({
      labelKey: 'insert.group.image',
      entries: [{ kind: 'image', labelKey: 'insert.image' }],
    });
  }
  return groups;
}
