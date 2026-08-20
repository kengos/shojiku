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
// fixed exemplar instant. A transport that cannot answer yields empty strings
// and the surface simply shows the pattern with no preview, exactly as it does
// before the first answer arrives.

import { useEffect, useState } from 'react';
import type { PatternProbe, ProbeResult } from '../engine/types';

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
}

const EMPTY: PatternPreview = { sample: '', warning: null, tokens: [] };

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
        if (!live || results.length < probes.length) {
          return;
        }
        setPreview({
          sample: results[0].sample,
          warning: results[0].warning,
          tokens: PATTERN_TOKENS.map((token, index) => ({
            token,
            sample: results[index + 1].sample,
          })),
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [fieldType, pattern, probe]);
  return preview;
}
