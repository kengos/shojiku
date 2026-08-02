// Byte-progress arithmetic for the first-load experience: turn a raw
// {loaded, total} reading into something a bar can render, or say "no idea".
// Pure — no browser globals, no React — because every producer of these numbers
// is untrusted-ish: a `Content-Length` header comes from whatever server is in
// front of the app (absent behind chunked encoding, a lie behind a broken
// proxy), and a font index is user-writable storage by the time a draft is
// restored. The single rule: a reading either yields a clamped [0,1] ratio with
// display text, or it yields null and the view degrades to an indeterminate
// bar. Nothing here can produce NaN, a negative width, or a ratio over 1.

/** One byte-progress reading. `total` absent means the size is unknown (no
 * `Content-Length`); a non-finite or non-positive total means it is unusable,
 * which is the same thing as far as a bar is concerned. */
export interface ByteProgress {
  readonly loaded: number;
  readonly total?: number;
}

/** A DETERMINATE reading: what a progress bar and its caption need. `ratio` is
 * clamped to [0,1] and `percent` is that as a whole number, so a view can use
 * both without re-checking either. The texts are chrome display strings (the
 * GUI formats its OWN chrome; document data still goes through the engine). */
export interface ProgressReading {
  readonly ratio: number;
  readonly percent: number;
  readonly loadedText: string;
  readonly totalText: string;
}

// DECIMAL units, because the unit label is decimal: writing "MB" over a 1024²
// division is the wrong number for the word, and it is also not what a user's
// own browser download list shows them for the same transfer.
const KB = 1000;
const MB = 1000 * 1000;

/** Chrome-side byte display: MB with one decimal from 1 MB up, whole KB below.
 * Only ever called with a finite, clamped value (see `readProgress`). */
function formatBytes(bytes: number): string {
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / KB)} KB`;
}

/** The determinate reading for a progress value, or `null` when the total is
 * missing or unusable and the view must fall back to an indeterminate bar.
 *
 * `loaded` is clamped into [0, total] on the way through, so an over-reporting
 * server (a `Content-Length` smaller than the body it then sends) tops the bar
 * out at 100% instead of overflowing it, and a negative or non-finite `loaded`
 * is treated as unknown rather than rendered. */
export function readProgress(progress: ByteProgress): ProgressReading | null {
  const { loaded, total } = progress;
  if (total === undefined || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  if (!Number.isFinite(loaded)) {
    return null;
  }
  const clamped = Math.min(Math.max(loaded, 0), total);
  const ratio = clamped / total;
  return {
    ratio,
    percent: Math.round(ratio * 100),
    loadedText: formatBytes(clamped),
    totalText: formatBytes(total),
  };
}
