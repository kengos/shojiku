// The default snippet each insert-menu kind drops into the document. Every
// value is engine-canonical and probed against the real engine to render
// diagnostics-free AND visibly; the module is framework-free and holds no
// document knowledge — `insertMenu.ts` decides what the menu offers,
// `model.ts` decides where the result lands.

import type { SnippetValue } from '@shojiku/designer-core';
import type { InsertKind } from './insertMenu';

/** The default snippet per kind — engine-canonical values, probed against the
 * real engine to render diagnostics-free AND visibly: a style-less rect draws
 * nothing (no diagnostic either), hence the borderWidth; the text item carries
 * no box so flow auto-sizes it (no fixed height to mismatch the font size). */
export function insertSnippet(
  kind: InsertKind,
  defaultText: string,
  cutLine: CutLineText = { label: 'cut here', width: DEFAULT_CUT_LINE_PT },
): SnippetValue {
  switch (kind) {
    case 'text':
      return { type: 'text', text: defaultText };
    case 'cutLine':
      return cutLineSnippet(cutLine);
    case 'line':
      // No `style`: the engine's own 1 pt black stroke is already visible, so
      // authoring one would put a value in the file the user never chose (the
      // `page_number` `format` precedent). No `box` either — the engine rejects
      // that key on a `line` outright.
      return {
        type: 'line',
        from: { x: 0, y: RULE_Y_PT },
        to: { x: '100%', y: RULE_Y_PT },
      };
    case 'rect':
      return { type: 'rect', box: { w: 120, h: 60 }, style: { borderWidth: 1 } };
    case 'ellipse':
      // No `style`: a form mark's outline defaults to 1 pt black when NO layer
      // authors a `borderWidth` (`DEFAULT_MARK_STROKE_PT`), because a mark's
      // visible geometry is its function — so it draws without authoring a
      // value the user never chose (the `line` precedent). The box IS
      // required: an unanchored ellipse with no positive `w`/`h` is skipped
      // with `mark_missing_size`. 60x40 is the rect's own 2:1 proportion at
      // half its scale — an oval rather than a circle, which is what circling
      // a word or a table cell wants.
      return { type: 'ellipse', box: { w: 60, h: 40 } };
    case 'checkbox':
      // No `box` either, and here that is the ENGINE's own default rather than
      // an omission: an unsized checkbox takes the inherited font's cap-height
      // square, which is a frame matched to the label beside it. That is the
      // size an author wants and cannot compute, so authoring one would be
      // worse than authoring none. It is why this row is armed on
      // `checkbox.auto_size` as well as `checkbox`.
      return { type: 'checkbox' };
    case 'qrCode':
      return { type: 'qr_code', box: { w: 60, h: 60 }, text: 'https://example.com' };
    case 'pageNumber':
      // No `format` key: the engine's own `{page} / {pages}` is the default,
      // and authoring it would put a value in the file the user never chose.
      // No `h`: 14pt is smaller than the line box of the blank presets' own
      // default text (10.5pt at the engine's 1.4 line height = 14.7pt), so a
      // fixed height made the first page number a reader inserts warn. It
      // auto-sizes like any other text-shaped item.
      return { type: 'page_number', box: { w: '100%' } };
  }
}

/** Fallback cut-line width (pt) when no render geometry is available yet — the
 * A4 portrait margin box at the engine's default margins, so a first insert
 * before the first paint still spans a sensible run. */
export const DEFAULT_CUT_LINE_PT = 515;

/** How far below the flow cursor a plain rule sits, in pt.
 *
 * Measured against the real engine rather than chosen: in a flow a `line`
 * reserves its own vertical extent and is painted at the BOTTOM of what it
 * reserves, so every point of `y` becomes air ABOVE the rule and none below it
 * — the rule is always flush against whatever follows. No value gives it air
 * on BOTH sides, so this is the least-bad one rather than a balanced one:
 * probed at 0, 4, 8 and 12 pt, 0 touches the text above and reads as an
 * underline of it, 8 and 12 open a gap above while still hugging what follows,
 * and 4 is small enough that the preceding line box's own descent carries the
 * separation. */
export const RULE_Y_PT = 4;

/** What a cut-here-line insert needs beyond the menu: the localized label to draw
 * and how wide the rule may run. */
export interface CutLineText {
  readonly label: string;
  /** The page content width in pt. Pixel-derived geometry is ceil-inflated, so
   * the caller floors it; a non-finite value falls back to A4's. */
  readonly width: number;
}

/** The cut-here-line scaffold: a small centered label above a full-width dashed
 * rule, wrapped in one container so it inserts, moves and undoes as a unit.
 *
 * The rule is a real `line` item (its `style: dashed` is the wire this entry
 * is gated on). Its width comes from the caller's render geometry rather than
 * from a `"100%"` endpoint — the endpoints DO take a full `Length` (that is
 * the `line.length` capability the plain-rule row is gated on). That is a
 * TRADE, not a preference: a pt run is the same length wherever the scaffold
 * is moved to, and it goes stale on a page-size change and overflows inside a
 * narrower container, which `"100%"` would not. It stays pt because nobody has
 * reported the staleness and a committed test pins the floored width; the
 * plain rule, which has no such history, takes the fraction.
 * The mark is the localized WORD, not a ✂ glyph: U+2702 is absent
 * from every bundled face except the Chinese packs, so a scissors character
 * would print as tofu (and warn `missing_glyph`) in a Japanese document. */
function cutLineSnippet(cut: CutLineText): SnippetValue {
  const width =
    Number.isFinite(cut.width) && cut.width > 0 ? Math.floor(cut.width) : DEFAULT_CUT_LINE_PT;
  return {
    type: 'container',
    items: [
      {
        type: 'text',
        text: cut.label,
        style: { fontSize: 8, textAlign: 'center', color: '#6c757d' },
      },
      {
        type: 'line',
        from: { x: 0, y: 2 },
        to: { x: width, y: 2 },
        style: { width: 0.8, color: '#adb5bd', style: 'dashed' },
      },
    ],
  };
}
