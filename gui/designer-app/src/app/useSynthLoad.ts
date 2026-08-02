// The faker-backed sample-value synth for the document's locale, loaded best
// effort — a rejection degrades to the Designer's baseline synth behind a
// banner. Its effect is the editor's FIRST, and stays so: called at the head of
// the wiring order.

import type { ValueSynth } from '@shojiku/designer';
import { useEffect, useState } from 'react';
import type { AppServices } from './services';

export interface SynthLoad {
  readonly synth: ValueSynth | undefined;
  readonly synthError: boolean;
}

export function useSynthLoad(services: AppServices, engineLocale: string): SynthLoad {
  const [synth, setSynth] = useState<ValueSynth | undefined>(undefined);
  const [synthError, setSynthError] = useState(false);

  // Like the font-restore effect, this does not guard unmount: a late setState
  // is a React no-op, and the editor is keyed per document so a stale write
  // cannot land in the wrong session.
  useEffect(() => {
    const load = services.loadSynth;
    if (load === undefined) {
      return;
    }
    load(engineLocale).then(
      // A ValueSynth is a function; wrap so setState stores it rather than
      // invoking it as a state updater.
      (built) => setSynth(() => built),
      () => setSynthError(true),
    );
  }, [services, engineLocale]);

  return { synth, synthError };
}
