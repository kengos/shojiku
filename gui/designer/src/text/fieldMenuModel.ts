// What the chip editor's field menus OFFER — the one derivation behind both
// the insert menu and the replace picker, so the two cannot drift apart in
// which fields they show.
//
// Two rules live here and nowhere else. Offerability: without `bindings:` a
// charset-unsafe key would degrade to literal braces on the page, so it is not
// a pickable chip there — with declarations every field is offerable. And the
// document-scope SECTION exists only inside a row scope, where the bare `{key}`
// grammar cannot reach a document field into a cell; at document scope the two
// lists are the same rows and a second section would just repeat them.
//
// Offerability is settled BEFORE the search filter, so a set the rules empty
// reads as "no fields" rather than as a query that matched nothing — the
// popover tells those two states apart and needs the pre-filter count to do it.
//
// i18n-free by construction: sections carry their heading KEY, and the
// component translates. Pure, so both menus' behaviour is unit-testable without
// rendering either of them.

import { filterOptions, type PickerOption } from '../panel/pickerModel';
import type { ChipContext } from './chipContext';
import { chipWire } from './chipModel';

/** One labeled group of offered rows. `headingKey` is null for a single
 * unlabeled list; `doc` marks the DOCUMENT-scope section (the scope a pick
 * from it commits). */
export interface FieldMenuSection {
  readonly id: string;
  readonly headingKey: string | null;
  readonly rows: readonly PickerOption[];
  readonly doc: boolean;
}

export interface FieldMenu {
  /** How many rows were offered BEFORE the search filter. */
  readonly offered: number;
  /** Only the sections that have rows left after filtering. */
  readonly sections: readonly FieldMenuSection[];
}

/** The rows a chip field menu offers for `chips`, narrowed by `query`. */
export function fieldMenu(chips: ChipContext, query: string): FieldMenu {
  const { options, documentOptions, scope, canDeclare } = chips;
  const rowScoped = scope !== null;
  const offerable = options.filter((option) => canDeclare || chipWire(option.key) !== null);
  const documentOffered = rowScoped && canDeclare ? documentOptions : [];
  const sections: FieldMenuSection[] = [
    {
      id: 'row',
      headingKey: rowScoped ? 'chips.section.row' : null,
      rows: filterOptions(offerable, query),
      doc: false,
    },
    {
      id: 'document',
      headingKey: 'chips.section.document',
      rows: filterOptions(documentOffered, query),
      doc: true,
    },
  ];
  return {
    offered: offerable.length + documentOffered.length,
    sections: sections.filter((section) => section.rows.length > 0),
  };
}
