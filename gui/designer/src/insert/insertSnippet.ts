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
    case 'rect':
      return { type: 'rect', box: { w: 120, h: 60 }, style: { borderWidth: 1 } };
    case 'qrCode':
      return { type: 'qr_code', box: { w: 60, h: 60 }, text: 'https://example.com' };
    case 'pageNumber':
      // No `format` key: the engine's own `{page} / {pages}` is the default,
      // and authoring it would put a value in the file the user never chose.
      return { type: 'page_number', box: { w: '100%', h: 14 } };
  }
}

/** Fallback cut-line width (pt) when no render geometry is available yet — the
 * A4 portrait margin box at the engine's default margins, so a first insert
 * before the first paint still spans a sensible run. */
export const DEFAULT_CUT_LINE_PT = 515;

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
 * is gated on). `line` endpoints are plain pt numbers — no `%` — so the width
 * comes from the caller's render geometry rather than being authored as a
 * fraction. The mark is the localized WORD, not a ✂ glyph: U+2702 is absent
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
