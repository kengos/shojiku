// The one progress bar in the app, in two sizes: the thick one inside the
// preset-open panel and the hairline rail under the header while the engine
// module arrives in the background. One component so the accessible contract is
// written once — a bar is the only thing conveying the wait, so it carries a
// name, and `aria-valuenow` appears ONLY when there is a real number behind it
// (an indeterminate transfer that claims a value is a bar that lies).

import type { ProgressReading } from './progress';

export interface ProgressBarProps {
  /** The determinate reading, or `null` to run indeterminate. */
  readonly reading: ProgressReading | null;
  /** The bar's accessible name — what is being waited on. */
  readonly label: string;
  /** Track height utility: the panel bar is thicker than the header rail. */
  readonly heightClass: string;
}

export function ProgressBar({ reading, label, heightClass }: ProgressBarProps) {
  const indeterminate = reading === null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      // Omitted (React drops an `undefined` attribute) when indeterminate.
      aria-valuenow={reading?.percent}
      className={`overflow-hidden rounded-full bg-accent/20 ${heightClass}`}
    >
      {/* Indeterminate fills the track and breathes instead of claiming a
          width; `motion-safe:` keeps it still for a reduced-motion viewer. */}
      <div
        className={`h-full rounded-full bg-accent${indeterminate ? ' motion-safe:animate-pulse' : ''}`}
        style={{ width: indeterminate ? '100%' : `${String(reading.percent)}%` }}
      />
    </div>
  );
}
