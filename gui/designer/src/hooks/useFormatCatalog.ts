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
//
// It also answers for a data item with its OWN currency (`atCurrency`): the
// catalog of a copy of the document whose `defaults.currency` is that code
// (`formats/currencyCopy.ts`), so the item's samples are the engine's rendering
// in its own currency. Answers are kept per code until the catalog's slice of
// the document changes, a few codes at most.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineTransport } from '../engine/transport';
import type { FormatCatalog, PatternProbe, ProbeResult } from '../engine/types';
import { withCurrency } from '../formats/currencyCopy';

/** How many per-currency catalogs are kept (the oldest goes first). */
export const CURRENCY_CATALOGS_KEPT = 8;

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
  /** The catalog as if the document's currency were `code`; `null` when the
   * transport cannot answer, the copy cannot be made, the engine cannot parse
   * it (a document mid-edit), or the engine refuses. */
  readonly atCurrency: (code: string) => Promise<FormatCatalog | null>;
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

  // Keyed by code, cleared whenever the catalog's own slice of the document
  // moves or the engine is swapped (an older answer describes nothing now).
  const byCode = useRef({
    key,
    transport,
    answers: new Map<string, Promise<FormatCatalog | null>>(),
  });
  const atCurrency = useCallback(
    (code: string): Promise<FormatCatalog | null> => {
      const cache = byCode.current;
      if (cache.key !== key || cache.transport !== transport) {
        cache.key = key;
        cache.transport = transport;
        cache.answers.clear();
      }
      const kept = cache.answers.get(code);
      if (kept !== undefined) {
        return kept;
      }
      const answer = catalogAtCurrency(transport, latest.current, code);
      if (cache.answers.size >= CURRENCY_CATALOGS_KEPT) {
        cache.answers.delete(cache.answers.keys().next().value as string);
      }
      cache.answers.set(code, answer);
      return answer;
    },
    [transport, key],
  );

  return { catalog, probe, atCurrency };
}

/** One currency's catalog over a copy of `text` (see `atCurrency`). Exported for
 * the real-engine seam suite, which runs it against the wasm transport. */
export async function catalogAtCurrency(
  transport: EngineTransport,
  text: string,
  code: string,
): Promise<FormatCatalog | null> {
  const ask = transport.formatCatalog;
  const copy = withCurrency(text, code);
  if (ask === undefined || copy === null) {
    return null;
  }
  try {
    // The engine answers a catalog even for a template it cannot parse — at the
    // locale's own default currency, which is exactly the wrong-currency sample
    // this exists to avoid. So a copy the engine cannot read answers nothing.
    const checked = await transport.validate(copy, '{}');
    if (checked.items.some((d) => d.severity === 'error' && d.category === 'parse')) {
      return null;
    }
    return await ask.call(transport, copy, []);
  } catch {
    return null;
  }
}
