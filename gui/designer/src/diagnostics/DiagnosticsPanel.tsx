// The diagnostics panel: the engine's diagnostics rendered from `code` + typed
// `args` through the ICU catalog (never by parsing the English `message`), with
// severity labels. A row that carries a `path` is a button that selects that
// node on the canvas — reusing the ONE selection state, so a diagnostic and a
// canvas box highlight the same thing (no separate highlight model). A pathless
// row is inert. `origin` is never shown (a GUI hides the engine source
// location). The diagnostics must come from the SAME render outcome the canvas
// is showing, so a click resolves against current geometry.
//
// A diagnostic whose fix is MECHANICAL gets a button beside it — `fixModel.fixFor`
// returns the candidate resolutions (one op batch each, one undo step each), or
// null so no dead button appears. Most diagnostics have exactly one candidate and
// render exactly one button; a diagnostic with two equally valid answers (keep
// `src` vs keep `data`) renders both, because only the author knows which.
// The buttons are siblings of the select target, never nested inside it.

import type { Op } from '@shojiku/designer-core';
import type { Diagnostic, Severity } from '../engine/types';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { AdvisoryRow } from './AdvisoryRow';
import type { TextCollision } from './collisions';
import { fixFor, type ReadNode } from './fixModel';

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly Diagnostic[];
  /** GUI-derived advisories — things the engine is deliberately silent about
   * because they are legal (text landing on other text). Kept separate from
   * `diagnostics` so the engine's `code` namespace stays the engine's. */
  readonly advisories?: readonly TextCollision[];
  readonly onSelect: (path: string) => void;
  /** Reads a materialized node by path — the fix builders inspect the document
   * to find which keys are actually removable. Display-only (never written). */
  readonly read: ReadNode;
  /** Applies a fix's op batch transactionally (one undo step). */
  readonly onApplyFix: (ops: readonly Op[]) => void;
}

const SEVERITY_LABEL_KEY: Record<Severity, string> = {
  error: 'severity.error',
  warning: 'severity.warning',
  info: 'severity.info',
};

/** The severity badge palette per level (warn/error fill; info outlines). */
const SEVERITY_BADGE: Record<Severity, string> = {
  error: 'bg-error-bg text-error-text',
  warning: 'bg-warn-bg text-warn-text',
  info: 'border border-border text-muted',
};

const DIAG_ROW = 'flex min-w-0 flex-1 items-baseline gap-2 text-left';

function DiagnosticRow({
  diag,
  onSelect,
  read,
  onApplyFix,
}: {
  diag: Diagnostic;
  onSelect: (path: string) => void;
  read: ReadNode;
  onApplyFix: (ops: readonly Op[]) => void;
}) {
  const { t, describe } = useI18n();
  const body = (
    <>
      <span className={`shrink-0 rounded-full px-2 font-semibold ${SEVERITY_BADGE[diag.severity]}`}>
        {t(SEVERITY_LABEL_KEY[diag.severity])}
      </span>
      <span className="text-text">{describe(diag)}</span>
    </>
  );
  const { path } = diag;
  const fix = fixFor(diag, read);
  return (
    <li className="flex items-baseline gap-2">
      {path !== undefined ? (
        <button
          type="button"
          className={`${DIAG_ROW} cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 hover:bg-bg`}
          onClick={() => onSelect(path)}
        >
          {body}
        </button>
      ) : (
        <div className={DIAG_ROW}>{body}</div>
      )}
      {/* One button per candidate resolution, side by side. Widths are
          deliberately not equalised: a shared width pads the short labels and
          truncates the long localized ones. */}
      {fix?.map((candidate) => (
        <span className="group/tip relative shrink-0" key={candidate.labelKey}>
          <button
            type="button"
            className={`${BTN_SM} shrink-0 whitespace-nowrap text-xs`}
            onClick={() => onApplyFix(candidate.ops)}
          >
            {t(candidate.labelKey, candidate.labelArgs)}
          </button>
          <TipBubble text={t('diagnostics.fixTip')} />
        </span>
      ))}
    </li>
  );
}

export function DiagnosticsPanel({
  diagnostics,
  advisories = [],
  onSelect,
  read,
  onApplyFix,
}: DiagnosticsPanelProps) {
  const { t } = useI18n();
  // "No problems." must mean BOTH lists are empty — the whole point of the
  // advisories is that a document the engine passes cleanly can still have
  // text sitting on top of text.
  const empty = diagnostics.length === 0 && advisories.length === 0;
  return (
    <section
      className="max-h-[132px] overflow-y-auto border-t border-border bg-chrome px-3 py-2 text-sm"
      aria-label={t('diagnostics.title')}
    >
      {empty ? (
        <p className="m-0 text-muted">{t('diagnostics.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {diagnostics.map((diag) => (
            <DiagnosticRow
              key={`${diag.code}:${diag.path ?? ''}:${diag.message}`}
              diag={diag}
              onSelect={onSelect}
              read={read}
              onApplyFix={onApplyFix}
            />
          ))}
          {advisories.map((collision) => (
            <AdvisoryRow
              key={`${collision.page}:${collision.a.path}:${collision.b.path}`}
              collision={collision}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
