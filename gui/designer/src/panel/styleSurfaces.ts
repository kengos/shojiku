// Which text-and-box style controls an item TYPE is offered, as data. The rule
// over every row: a control appears only on the types whose engine HONOURS the
// key — a key the layout ignores for a type would be a control that changes
// nothing (the table's vertical-alignment precedent). Each set below cites the
// layout code that decides it, read from the engine source rather than the
// reference prose. Framework-free; every lookup is a real `Set`.

import { hasCapability } from './itemPanelProps';

/** Types whose OWN text the typography keys style (font, size, weight, slant,
 * alignment, line height, colour, letter spacing): the three text surfaces
 * (`engine/layout/src/engine/text/block.rs`, `band.rs` for a page number,
 * `list.rs` for list entries). */
export const TEXT_SURFACE_TYPES: ReadonlySet<string> = new Set(['text', 'page_number', 'list']);

/** Types whose typography is INHERITED by what they hold and paints nothing of
 * their own — a container's text keys reach its children through the cascade. */
export const TEXT_INHERIT_TYPES: ReadonlySet<string> = new Set(['container']);

/** Types letter spacing is offered on: the three text surfaces draw it, and a
 * container's and a table's own value is inherited by everything they hold
 * (`letterSpacing` is in the engine's inherited set, and a table's own style is
 * what its cells inherit — `table/atom.rs`). */
export const LETTER_SPACING_TYPES: ReadonlySet<string> = new Set([
  'text',
  'page_number',
  'list',
  'container',
  'table',
]);

/** Types that honour `verticalAlign` on their own box: plain text and a page
 * number (`text_block`). A list, an image, a QR code and a container do not —
 * the two atoms always centre, a container never reads it. */
export const VALIGN_TYPES: ReadonlySet<string> = new Set(['text', 'page_number']);

/** Types that honour `textOverflow`: the two `text_block` surfaces. A list cuts
 * each entry to one line with an ellipsis whatever the key says. */
export const TEXT_OVERFLOW_TYPES: ReadonlySet<string> = new Set(['text', 'page_number']);

/** Types that honour `textDecoration` (not inherited, so a container's would
 * reach nothing). */
export const DECORATION_LINE_TYPES: ReadonlySet<string> = TEXT_SURFACE_TYPES;

/** Types that honour `overflow` on their own box: a container. The two
 * sub-template frames (a repeat cell, a card) honour it too, and carry it on
 * their own form. */
export const OVERFLOW_TYPES: ReadonlySet<string> = new Set(['container']);

/** Types whose own painting takes `opacity`. Everything with a decoration tab
 * except a `table` (its grid is always drawn opaque) and a `line` (whose stroke
 * takes opacity in its own style shape). */
export const OPACITY_TYPES: ReadonlySet<string> = new Set([
  'text',
  'page_number',
  'list',
  'image',
  'qr_code',
  'container',
  'rect',
  'char_grid',
  'ellipse',
  'checkbox',
]);

/** Of `OPACITY_TYPES`, the ones where it reaches only the item's own FILL and
 * BORDER: a QR code's modules stay opaque (scannability), and a container's
 * opacity is not group compositing, so its children are untouched. */
export const OPACITY_DECORATION_ONLY: ReadonlySet<string> = new Set(['qr_code', 'container']);

/** Types that honour `box.padding`. A `rect` and the two form marks ignore it
 * (nothing to inset), so they are left out rather than offered a field that
 * moves nothing. A `table` is here with a flow-body caveat (`sideSets`). */
export const PADDING_TYPES: ReadonlySet<string> = new Set([
  'text',
  'page_number',
  'list',
  'qr_code',
  'image',
  'container',
  'char_grid',
  'table',
]);

/** A `char_grid`'s glyph keys: its characters take colour, face, weight and
 * slant, and a size only when the ITEM authors one (otherwise the cell decides,
 * `char_grid.rs`). Alignment, line height and letter spacing are not honoured
 * for its cells, so they are not offered. */
export const CHAR_GRID_GLYPH_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle'] as const;

/** The section-level `?` for the text section: only where the section does
 * something a reader would not expect — a container's text keys style what it
 * HOLDS, a char_grid's cells take a subset, and a list cuts every entry to one
 * line (it has no overflow section to say so). */
export function textHelpKey(type: string): string | undefined {
  if (TEXT_INHERIT_TYPES.has(type)) {
    return 'panel.itemSection.text.inheritHelp';
  }
  if (type === 'list') {
    return 'panel.itemSection.text.listHelp';
  }
  return type === 'char_grid' ? 'panel.itemSection.text.charGridHelp' : undefined;
}

/** Which overflow key the type honours, if any. */
export function overflowKeyOf(type: string): 'textOverflow' | 'overflow' | null {
  if (TEXT_OVERFLOW_TYPES.has(type)) {
    return 'textOverflow';
  }
  return OVERFLOW_TYPES.has(type) ? 'overflow' : null;
}

/** The fill-and-border section's title: a `line`'s is its stroke, and a
 * `char_grid` has a fill but no border control (its lines are the ruling). */
export function fillTitleKey(type: string): string {
  if (type === 'line') {
    return 'panel.field.line';
  }
  return type === 'char_grid' ? 'panel.itemSection.fill.fillOnly' : 'panel.itemSection.fill.title';
}

/** The section that starts open: the first one, except that a container
 * opens on its fill — its text keys only reach what it holds, and its fill and
 * border are what it draws itself. */
export function openingSection(
  type: string,
  sections: readonly { readonly id: string }[],
): string | undefined {
  const preferred = TEXT_INHERIT_TYPES.has(type)
    ? sections.find((section) => section.id === 'item.fill')
    : undefined;
  return (preferred ?? sections[0])?.id;
}

/** Whether the type's opacity field is offered against this engine: a type in
 * `OPACITY_TYPES`, `style.opacity` declared, and for an image `image.opacity`
 * too (the asset's own alpha arrived on its own key). */
export function opacityOffered(type: string, capabilities: readonly string[] | undefined): boolean {
  return (
    OPACITY_TYPES.has(type) &&
    hasCapability(capabilities, 'style.opacity') &&
    (type !== 'image' || hasCapability(capabilities, 'image.opacity'))
  );
}
