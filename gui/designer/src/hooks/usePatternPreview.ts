// What a date/datetime PATTERN renders — asked of the engine, per keystroke.
//
// Two answers in one round trip, because they come from the same probe call:
// the whole pattern's output (the live line under the field), and each TOKEN's
// output on its own (the chips above it). The chips are the point of the
// surface: an author does not have to know that `EEEE` means the long weekday
// name if pressing it shows 「火曜日」 and inserts it.
//
// The GUI never formats, so there is no local token table producing these
// strings — every one of them is `shojiku_formatter` rendering the engine's own
// fixed exemplar instant. A transport that cannot answer is its OWN state
// (`unavailable`), deliberately not the same as the moment before the first
// answer arrives: both show no preview, but only one of them can be fixed by
// typing, and the surface must not tell an author to press token buttons that
// are not on screen.
//
// A REFUSAL is not that case and must not read as it. The engine declines to
// probe a pattern past its length cap, and the refusal arrives with an empty
// sample by construction — so without carrying it through, an over-long
// pattern is indistinguishable from an empty one and the surface tells an
// author who has typed 300 characters to type something.

import { useEffect, useState } from 'react';
import type { PatternProbe, ProbeRefusal, ProbeResult } from '../engine/types';

/** The tokens offered as chips, in reading order (a date, then a time). Each is
 * a member of the engine's own token table (`engine/formatter`'s `TOKENS`); the
 * table is longest-match, so every spelling here is the one that actually
 * matches. A drift-guard test pins that the engine still renders each of them
 * as a distinct string. */
export const PATTERN_TOKENS: readonly string[] = [
  'yyyy',
  'MM',
  'MMMM',
  'dd',
  'EEEE',
  'GG',
  'a',
  'HH',
  'mm',
];

export interface TokenSample {
  readonly token: string;
  readonly sample: string;
}

export interface PatternPreview {
  /** What the whole pattern renders. Empty before the first answer. */
  readonly sample: string;
  /** A degradation the formatter reported, in the engine's English. */
  readonly warning: string | null;
  /** Each token's own output, aligned with `PATTERN_TOKENS`. */
  readonly tokens: readonly TokenSample[];
  /** Why the engine declined to run the pattern probe, when it did. A refusal
   * yields an empty `sample`, so a reader that ignores this cannot tell a
   * refused pattern from an unwritten one. */
  readonly refused: ProbeRefusal | null;
  /** The probe could not ANSWER — a transport with no `formatCatalog`, or one
   * whose query failed. Distinct from a refusal (which is an answer) and from
   * an unwritten pattern (which renders as an empty sample): all three produce
   * no preview, and a surface that shows one prompt for all of them tells an
   * author to press token buttons that are not there. */
  readonly unavailable: boolean;
}

const EMPTY: PatternPreview = {
  sample: '',
  warning: null,
  tokens: [],
  refused: null,
  unavailable: false,
};

const UNAVAILABLE: PatternPreview = { ...EMPTY, unavailable: true };

type Probe = (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;

/** Preview `pattern` as a `date` or `datetime`. The probe list is the pattern
 * FIRST and the token chips after it, so one call answers the whole surface;
 * an answer that arrives after the pattern moved on is dropped. */
export function usePatternPreview(
  fieldType: 'date' | 'datetime',
  pattern: string,
  probe: Probe,
): PatternPreview {
  const [preview, setPreview] = useState<PatternPreview>(EMPTY);
  useEffect(() => {
    let live = true;
    const probes: PatternProbe[] = [
      { fieldType, pattern },
      ...PATTERN_TOKENS.map((token) => ({ fieldType, pattern: token })),
    ];
    probe(probes)
      .then((results) => {
        if (!live) {
          return;
        }
        // A SHORT answer is the shape a probe that cannot answer takes: the
        // catalog hook returns `[]` both for a transport without
        // `formatCatalog` and for a query that threw. Reporting it as its own
        // state is what keeps "the engine did not answer" out of the
        // "you have not typed anything" prompt.
        if (results.length < probes.length) {
          setPreview(UNAVAILABLE);
          return;
        }
        setPreview({
          sample: results[0].sample,
          warning: results[0].warning,
          refused: results[0].refused,
          unavailable: false,
          tokens: PATTERN_TOKENS.map((token, index) => ({
            token,
            sample: results[index + 1].sample,
          })),
        });
      })
      // The catalog hook's own probe never rejects, but the prop is a host
      // seam: a rejected query is the same answer-less state as a short one.
      .catch(() => {
        if (live) {
          setPreview(UNAVAILABLE);
        }
      });
    return () => {
      live = false;
    };
  }, [fieldType, pattern, probe]);
  return preview;
}
