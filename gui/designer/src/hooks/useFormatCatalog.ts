// The format catalog for the open document: which display variants each
// field type can pick and what each one renders, asked of the ENGINE rather
// than assembled here (the GUI never formats).
//
// Two things it deliberately does NOT do. It does not re-ask on every
// keystroke — the catalog depends only on the `formats:` registry, the
// `defaults:` block and the locale, so the caller passes a `key` naming that
// slice and a body edit costs nothing. And it does not fail: a transport
// without `formatCatalog` (an older engine, a host that omits it) simply
// leaves the catalog `null`, which is what the panel's feature gate reads.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineTransport } from '../engine/transport';
import type { FormatCatalog, PatternProbe, ProbeResult } from '../engine/types';

export interface FormatCatalogOptions {
  readonly transport: EngineTransport;
  /** The whole template source — the engine parses it. */
  readonly text: string;
  /** What the catalog actually depends on, as a comparable string: the
   * `formats:` registry, the `defaults:` block, and the locale. Passing the
   * whole document here would re-ask the engine on every keystroke. */
  readonly key: string;
}

export interface FormatCatalogState {
  /** `null` until the first answer, and permanently on a transport that has
   * no `formatCatalog` — a capability gate by PRESENCE, never a version
   * sniff. */
  readonly catalog: FormatCatalog | null;
  /** Previews patterns that are not authored yet. Resolves to an empty list
   * when the transport cannot answer, so a caller never has to branch on
   * availability twice. */
  readonly probe: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
}

export function useFormatCatalog({
  transport,
  text,
  key,
}: FormatCatalogOptions): FormatCatalogState {
  const [catalog, setCatalog] = useState<FormatCatalog | null>(null);
  // The live text, read by `probe` without making it a dependency: a probe is
  // asked for at the moment the user types a pattern, and should run against
  // whatever the document says THEN — not against the text captured when the
  // callback was created.
  const latest = useRef(text);
  latest.current = text;

  // `key` names the document slice the catalog depends on (`formats:`,
  // `defaults:`, the locale), so a body edit costs no engine call.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the intentional trigger; the text is read fresh from a ref at that key.
  useEffect(() => {
    const ask = transport.formatCatalog;
    if (ask === undefined) {
      return;
    }
    let live = true;
    ask
      .call(transport, latest.current, [])
      .then((next) => {
        // A catalog that arrived after the document moved on describes a
        // document nobody is looking at any more.
        if (live) {
          setCatalog(next);
        }
      })
      // A transport failure is not worth blanking a working picker over: the
      // last good catalog stays, exactly as the canvas keeps its last good
      // pages.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [transport, key]);

  const probe = useCallback(
    async (probes: readonly PatternProbe[]): Promise<readonly ProbeResult[]> => {
      const ask = transport.formatCatalog;
      if (ask === undefined || probes.length === 0) {
        return [];
      }
      try {
        const answer = await ask.call(transport, latest.current, probes);
        return answer.probes;
      } catch {
        return [];
      }
    },
    [transport],
  );

  return { catalog, probe };
}
