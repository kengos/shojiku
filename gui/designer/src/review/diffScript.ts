// How the two texts DIFFER: line splitting, the common prefix/suffix trim that
// sizes the work, and the LCS edit script over the differing middle. Pure and
// display-agnostic — what the diff SHOWS is `diffRows.ts`, and the cap that
// refuses an oversized middle is applied by `diffModel.ts`.

/** Split into lines, normalizing CRLF so a line-ending difference alone is not a
 * change. A plain scan — never a RegExp over attacker-controlled text. */
export function lines(text: string): string[] {
  const out = text.split('\n');
  for (let i = 0; i < out.length; i += 1) {
    const line = out[i] as string;
    if (line.endsWith('\r')) {
      out[i] = line.slice(0, -1);
    }
  }
  return out;
}

/** The common prefix and suffix line counts of two line arrays — the cheap trim
 * that sizes the LCS middle before committing to it (an authored edit is local,
 * so the differing middle is tiny). */
export function commonTrim(
  base: readonly string[],
  cur: readonly string[],
): { readonly prefix: number; readonly suffix: number } {
  let prefix = 0;
  const maxPrefix = Math.min(base.length, cur.length);
  while (prefix < maxPrefix && base[prefix] === cur[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (suffix < maxSuffix && base[base.length - 1 - suffix] === cur[cur.length - 1 - suffix]) {
    suffix += 1;
  }
  return { prefix, suffix };
}

/** One edit-script step over the trimmed middle. `baseIdx`/`curIdx` are indices
 * into the ORIGINAL line arrays (the trim offset is already folded in). */
export interface Step {
  readonly kind: 'context' | 'added' | 'removed';
  readonly baseIdx: number;
  readonly curIdx: number;
}

/** LCS edit script over `base[bStart..bEnd)` vs `cur[cStart..cEnd)` (the already
 * prefix/suffix-trimmed middle). Classic DP table + backtrack; the caller has
 * bounded both spans to `MAX_LCS_LINES`. */
function lcsSteps(
  base: readonly string[],
  cur: readonly string[],
  bStart: number,
  bEnd: number,
  cStart: number,
  cEnd: number,
): Step[] {
  const n = bEnd - bStart;
  const m = cEnd - cStart;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const at = i * width + j;
      if (base[bStart + i] === cur[cStart + j]) {
        table[at] = table[(i + 1) * width + (j + 1)] + 1;
      } else {
        const down = table[(i + 1) * width + j] as number;
        const right = table[i * width + (j + 1)] as number;
        table[at] = down >= right ? down : right;
      }
    }
  }
  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[bStart + i] === cur[cStart + j]) {
      steps.push({ kind: 'context', baseIdx: bStart + i, curIdx: cStart + j });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + (j + 1)] as number)) {
      steps.push({ kind: 'removed', baseIdx: bStart + i, curIdx: -1 });
      i += 1;
    } else {
      steps.push({ kind: 'added', baseIdx: -1, curIdx: cStart + j });
      j += 1;
    }
  }
  while (i < n) {
    steps.push({ kind: 'removed', baseIdx: bStart + i, curIdx: -1 });
    i += 1;
  }
  while (j < m) {
    steps.push({ kind: 'added', baseIdx: -1, curIdx: cStart + j });
    j += 1;
  }
  return steps;
}

/** Build the full step list: prefix context, the LCS middle, suffix context. */
export function fullSteps(base: readonly string[], cur: readonly string[]): Step[] {
  const { prefix, suffix } = commonTrim(base, cur);
  const steps: Step[] = [];
  for (let k = 0; k < prefix; k += 1) {
    steps.push({ kind: 'context', baseIdx: k, curIdx: k });
  }
  steps.push(...lcsSteps(base, cur, prefix, base.length - suffix, prefix, cur.length - suffix));
  for (let k = 0; k < suffix; k += 1) {
    const bi = base.length - suffix + k;
    steps.push({ kind: 'context', baseIdx: bi, curIdx: cur.length - suffix + k });
  }
  return steps;
}
