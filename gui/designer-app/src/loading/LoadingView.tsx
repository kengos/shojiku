// The preset-open wait, made legible: which document is opening, the three
// named stages it goes through, and how far the active transfer has got. This
// replaces the app's old one-line "Loading fonts…" text, which named the wrong
// thing (the engine module dominates a cold first open) and carried no progress
// at all on a path that can move ~18 MB of Japanese font bytes.
//
// Pure over props — the phase derivation is `phase.ts`, the numbers are
// `progress.ts`. Used by BOTH bodies (standalone preset open and the mounted
// host's template open), so the wait looks the same wherever it happens.

import { useI18n } from '@shojiku/designer';
import { Check, TriangleAlert } from 'lucide-react';
import { APP_BANNER } from '../app/chrome';
import { ProgressBar } from './ProgressBar';
import {
  activeStage,
  type LoadPhase,
  phaseReading,
  type StageId,
  type StageState,
  stageViews,
} from './phase';

/** Stage → catalog key, spelled out rather than composed, so every key the app
 * renders is findable by a plain grep. */
const STAGE_LABEL: Readonly<Record<StageId, string>> = {
  engine: 'app.loading.engine',
  fonts: 'app.loading.fonts',
  render: 'app.loading.render',
};

export interface LoadingViewProps {
  /** The opening document's display name — the panel's title. */
  readonly name: string;
  /** Where the wait currently is. */
  readonly phase: LoadPhase;
}

/** The stage's leading mark. Done and failed carry a real icon; the active and
 * pending marks are rings, which need no glyph. */
function StageMark({ state }: { readonly state: StageState }) {
  if (state === 'done') {
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent text-on-accent">
        <Check aria-hidden size={12} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-full text-error-text">
        <TriangleAlert aria-hidden size={16} />
      </span>
    );
  }
  const ring = state === 'active' ? 'border-accent' : 'border-border';
  return (
    <span className={`grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${ring}`}>
      {state === 'active' ? <span className="size-1.5 rounded-full bg-accent" /> : null}
    </span>
  );
}

export function LoadingView({ name, phase }: LoadingViewProps) {
  const { t } = useI18n();
  const reading = phaseReading(phase);
  const stages = stageViews(phase);
  const activeLabel = t(STAGE_LABEL[activeStage(phase)]);
  return (
    <div className="grid flex-1 place-content-center p-6">
      <div className="w-[min(420px,100%)] rounded-lg border border-border bg-surface p-5">
        <h2 className="m-0 font-semibold text-[15px]">{name}</h2>
        <p className="mt-0.5 mb-4 text-muted text-xs">{t('app.loading.subtitle')}</p>
        <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
          {stages.map((stage) => (
            <li
              key={stage.id}
              className={`flex items-center gap-2.5 text-sm ${
                stage.state === 'active' ? 'font-semibold' : 'text-muted'
              }`}
            >
              <StageMark state={stage.state} />
              {t(STAGE_LABEL[stage.id])}
              {/* Byte counts belong to the stage actually transferring, and only
                  when its size is known. */}
              {stage.state === 'active' && reading !== null ? (
                <span className="ml-auto text-muted text-xs tabular-nums">
                  {reading.loadedText} / {reading.totalText}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {phase.kind === 'failed' ? (
          <p className={APP_BANNER}>{t('app.loading.failed')}</p>
        ) : (
          <>
            <ProgressBar reading={reading} label={activeLabel} heightClass="h-1.5" />
            {/* The percentage only; the active stage row already names the wait
                and shows its byte counts. */}
            {reading !== null ? (
              <p className="mt-1.5 mb-0 text-right text-muted text-xs tabular-nums">
                {reading.percent}%
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
