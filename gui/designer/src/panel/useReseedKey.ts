// The reseed key behind every commit-on-blur field. An uncontrolled input
// reseeds only when its `key` changes, so a REFUSED commit — which by
// definition leaves the committed value exactly where it was — used to leave
// the rejected text sitting on screen with nothing to say it had been thrown
// away. The nonce here is what makes a refusal move the key.

import { useCallback, useState } from 'react';

/** `[key, reseed]` for an uncontrolled commit-on-blur input.
 *
 * The key carries the committed VALUE, so undo, a selection change and an
 * ACCEPTED commit still reseed on their own exactly as before; the nonce is
 * added only for the case the value cannot cover. The nonce LEADS: it is
 * always a plain integer with no `#`, so `<nonce>#<value>` has an unambiguous
 * split point — a trailing counter would let `("20#1", 0)` and `("20", 1)`
 * produce the same key and silently skip a reseed.
 *
 * The key belongs on the INNER input, never on a whole widget: remounting a
 * stepper between its ▲ mousedown and its mouseup destroys the button
 * mid-click, so the click never completes.
 *
 * Callers bump the nonce after ANY committing blur, and ask nothing about how
 * the commit went. That is deliberate: "did the edit land?" is the wrong
 * question, because a commit can land and still not move the value — a CLAMP
 * (a negative gap to 0, an over-cap pen width) authors successfully and leaves
 * the value where it was, so a landed/refused signal would leave the rejected
 * text on screen exactly where a refusal would. The right question is what the
 * document holds NOW, which is what `value` already answers. `OpResult.ok` and
 * the revision counter are wrong for a third reason on top: `applyAll([])`
 * reports ok and bumps the revision, so both read a refusal as a success.
 *
 */
export function useReseedKey(value: string): readonly [string, () => void] {
  const [nonce, setNonce] = useState(0);
  const reseed = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);
  return [`${nonce}#${value}`, reseed];
}
