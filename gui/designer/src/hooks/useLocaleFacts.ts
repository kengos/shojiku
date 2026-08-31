// What the document's `defaults.locale` pick DOES, asked of the ENGINE rather
// than composed here (the GUI never formats).
//
// The panel used to read a per-locale table of literal sample strings, pinned
// to the pack files by a drift-guard test. This asks the engine for the same
// three samples, so they cannot drift from what the page prints — and it can
// answer for a locale the SESSION is not rendering through, which is the
// ordinary case: `defaults.locale` is the CLI/MCP render fallback and the
// preview follows the tag the host set at boot.
//
// Three things it deliberately does NOT do. It does not re-ask on every
// keystroke (the answer depends only on the `defaults:` slice, which the
// caller passes as `key`). It does not fail: an absent transport method, a
// pack the host cannot supply, or a rejected engine call all leave the facts
// unexplained rather than throwing. And it never captions a tag with another
// tag's facts — an answer is shown only while it still describes the tag on
// screen.

import { useEffect, useRef, useState } from 'react';
import type { EngineTransport } from '../engine/transport';
import type { LocaleFacts } from '../engine/types';

/** How many (tag, slice) answers are remembered. The locale field is a combo
 * with free entry, so its tag is user input and the cache is keyed by it —
 * bounded, and cleared wholesale rather than evicted one at a time. */
export const MAX_CACHED_FACTS = 32;

export interface LocaleFactsOptions {
  readonly transport: EngineTransport;
  /** The whole template source — the engine parses it for `defaults.currency`. */
  readonly text: string;
  /** The document slice the answer depends on, as a comparable string (the
   * same `defaults:`/`formats:` slice the format catalog is keyed on). */
  readonly key: string;
  /** The tag to explain, EXACTLY as the document authored it. The engine is
   * asked about the reader's own value; a tag it cannot resolve simply goes
   * unexplained. Empty = nothing picked. */
  readonly tag: string;
  /** What the AMOUNT depends on besides the pack — the document's currency
   * and its per-type currency default — as a comparable string. Separate
   * from `key` (the whole `defaults:` slice) so a font-size commit does not
   * blank a line it cannot change. */
  readonly currencyKey: string;
  /** Where the pack text comes from; a host that injects none gets builtins. */
  readonly localePacks: { overlayFor(tag: string): Promise<string | null> } | undefined;
}

/** One remembered answer, with the inputs it describes. */
interface Answer {
  readonly tag: string;
  readonly currencyKey: string;
  readonly facts: LocaleFacts;
}

export function useLocaleFacts({
  transport,
  text,
  key,
  tag,
  currencyKey,
  localePacks,
}: LocaleFactsOptions): LocaleFacts | null {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const cache = useRef(new Map<string, LocaleFacts>());
  // The live text, read by the effect without making it a dependency: a body
  // keystroke cannot change the answer, and `key` is what says so.
  const latest = useRef(text);
  latest.current = text;

  // `key` is the intentional trigger; the text is read fresh from the ref at
  // that key, so it is deliberately not a dependency.
  useEffect(() => {
    const ask = transport.localeFacts;
    if (ask === undefined || tag === '') {
      return;
    }
    // Unambiguous, not `${tag} ${key}`: the tag is free-entry user input, so
    // a separator that can also occur INSIDE either part makes two different
    // (tag, slice) pairs share one entry — which would caption a tag with
    // another tag's facts, the one thing this hook exists to prevent. Today
    // the slice's own grammar makes that unreachable (it always starts at a
    // top-level `defaults:`/`formats:` line); this makes it unreachable for a
    // reason that does not depend on the slice's grammar.
    const cacheKey = JSON.stringify([tag, key]);
    const remembered = cache.current.get(cacheKey);
    if (remembered !== undefined) {
      setAnswer({ tag, currencyKey, facts: remembered });
      return;
    }
    let live = true;
    const overlayFor = localePacks?.overlayFor;
    // No injection is not an error: the engine's own builtins need no pack.
    const overlay = overlayFor === undefined ? Promise.resolve(null) : overlayFor(tag);
    overlay
      .then((pack) => ask.call(transport, latest.current, tag, pack ?? undefined))
      .then((facts) => {
        // An answer that arrived after the document moved on describes a pick
        // nobody is looking at any more.
        if (!live) {
          return;
        }
        if (cache.current.size >= MAX_CACHED_FACTS) {
          cache.current.clear();
        }
        cache.current.set(cacheKey, facts);
        setAnswer({ tag, currencyKey, facts });
      })
      // A locale the host ships no pack for, a malformed pack, an engine that
      // refused: the panel explains nothing, exactly as it does for a tag the
      // engine cannot resolve. Never a throw out of a render.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [transport, key, tag, currencyKey, localePacks]);

  // Only ever the facts for the inputs ON SCREEN. A previous locale's samples
  // under a newly picked tag would be a statement about the document that is
  // simply false — and so would a previous CURRENCY's amount sitting directly
  // under the field that now reads something else, which is why the guard
  // covers both rather than the tag alone. (The canvas's last-good pixels are
  // not beside the control that contradicts them; these are.) A style edit
  // moves neither, so nothing blanks for an input that cannot change it.
  return answer !== null && answer.tag === tag && answer.currencyKey === currencyKey
    ? answer.facts
    : null;
}
