// The property panel with NOTHING selected. It used to be one apology and one
// button in a 560×1164 column — 87% of it empty — which is a lot of screen
// spent saying that nothing is happening.
//
// It now orients instead: the sentence says what to do next, and two lines say
// what the document IS, so the panel is worth glancing at even when the reader
// has not selected anything. It deliberately does NOT fill the column: an empty
// state orients and offers, it does not pad.
//
// Both facts come from the readers `PageSetup` already uses — no second walk of
// the document, and no new claim about the wire. Each of them DECLINES rather
// than guesses: `pageSummary` returns null for a page this build cannot
// describe, and the margin line is withheld for any wire form whose single
// value would be an invention (a scalar the reader normalises to the 25pt
// default is exactly that). A surface that exists to reassure has to say
// nothing rather than name a value the document does not hold.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { clip } from '../tree/nodeFields';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { BTN, PANEL } from '../ui/chrome';
import { MARGIN_SIDES, readMarginView } from './marginModel';
import { pageSummary, readPageView } from './pageSetupModel';

/** The two facts the empty panel states; `null` = this build cannot say. */
export interface DocumentGlance {
  readonly page: string | null;
  readonly margin: string | null;
}

/** The margin as one phrase, or null when no honest one exists: a finite scalar
 * is the uniform value in points, a map/array is its four sides in CSS order
 * (top right bottom left), an absent key is the engine's own default — and
 * anything else (a string, a hostile node) declines. Side values are carried
 * VERBATIM because the wire does: a per-side entry may state its own unit. */
function marginPhrase(raw: unknown, fallback: string): string | null {
  const page = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : undefined;
  const margin = (page as Record<string, unknown> | undefined)?.margin;
  if (margin === undefined) {
    return `${fallback} pt`;
  }
  if (typeof margin === 'number') {
    return Number.isFinite(margin) ? `${margin} pt` : null;
  }
  if (typeof margin !== 'object' || margin === null) {
    return null;
  }
  const view = readMarginView(raw);
  return clip(MARGIN_SIDES.map((side) => view.sides[side]).join(' / '));
}

/** What the document is, read through the same models the page-setup view uses.
 * A read that THROWS degrades to "nothing to say", like every other pure model
 * under `panel/`. */
export function documentGlance(read: EditorController['read']): DocumentGlance {
  let raw: unknown;
  try {
    raw = read('page');
  } catch {
    return { page: null, margin: null };
  }
  return {
    page: pageSummary(readPageView(raw)),
    margin: marginPhrase(raw, readMarginView(undefined).uniform),
  };
}

/** One line of the glance: the name on the left, the value on the right. */
function GlanceRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-text">{value}</span>
    </div>
  );
}

export function NoSelectionCard({
  controller,
  onOpenDocument,
}: {
  readonly controller: EditorController;
  readonly onOpenDocument?: () => void;
}) {
  const { t } = useI18n();
  const glance = documentGlance(controller.read);
  return (
    <aside data-tour={TOUR_ANCHORS.panel} className={PANEL} aria-label={t('panel.title')}>
      <p className="m-0 mb-3 text-sm text-muted">{t('panel.noSelection.hint')}</p>
      {glance.page === null && glance.margin === null ? null : (
        <div className="mb-3 rounded-md border border-border bg-surface px-2 py-1">
          {glance.page === null ? null : (
            <GlanceRow label={t('panel.noSelection.page')} value={glance.page} />
          )}
          {glance.margin === null ? null : (
            <GlanceRow label={t('panel.noSelection.margin')} value={glance.margin} />
          )}
        </div>
      )}
      {onOpenDocument === undefined ? null : (
        <button
          type="button"
          className={BTN}
          data-tour={TOUR_ANCHORS.panelDocSettings}
          onClick={onOpenDocument}
        >
          {t('panel.noSelection.open')}
        </button>
      )}
    </aside>
  );
}
