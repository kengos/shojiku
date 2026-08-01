// The diagnostics panel: the engine's diagnostics rendered from `code` + typed
// `args` through the ICU catalog (never by parsing the English `message`), with
// severity labels. A row that carries a `path` is a button that selects that
// node on the canvas — reusing the ONE selection state, so a diagnostic and a
// canvas box highlight the same thing (no separate highlight model). A pathless
// row is inert. `origin` is never shown (a GUI hides the engine source
// location). The diagnostics must come from the SAME render outcome the canvas
// is showing, so a click resolves against current geometry.
//
// A diagnostic whose fix is MECHANICAL gets a "直す" button beside it —
// `fixModel.fixFor` builds a `removeKey` op batch (one undo step) when a concrete
// removable key exists, and returns null otherwise so no dead button appears.
// The button is a sibling of the select target, never nested inside it.

import type { Op } from '@shojiku/designer-core';
import type { Diagnostic, Severity } from '../engine/types';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { fixFor, type ReadNode } from './fixModel';

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly Diagnostic[];
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
      {fix !== null ? (
        <span className="group/tip relative shrink-0">
          <button
            type="button"
            className={`${BTN_SM} shrink-0 whitespace-nowrap text-xs`}
            onClick={() => onApplyFix(fix)}
          >
            {t('diagnostics.fix')}
          </button>
          <TipBubble text={t('diagnostics.fixTip')} />
        </span>
      ) : null}
    </li>
  );
}

export function DiagnosticsPanel({
  diagnostics,
  onSelect,
  read,
  onApplyFix,
}: DiagnosticsPanelProps) {
  const { t } = useI18n();
  return (
    <section
      className="max-h-[132px] overflow-y-auto border-t border-border bg-chrome px-3 py-2 text-sm"
      aria-label={t('diagnostics.title')}
    >
      {diagnostics.length === 0 ? (
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
        </ul>
      )}
    </section>
  );
}
