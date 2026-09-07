// The link-URL control itself, shared by the two surfaces that carry one: the
// item's own `link:` (`panel/LinkField`) and one rich-text fragment's
// (`panel/SpansSection`). Extracted rather than copied — the behaviour below is
// four separate decisions that a second copy would drift from one at a time.
//
// It does NOT use the shared `TextField`, and the reason is the insert menu.
// `TextField` commits on blur and reseeds whenever the typed text differs — and
// clicking the menu IS a blur, so it would commit the half-typed URL and remount
// the input, destroying the caret the insertion needs before the menu had even
// opened. So the blur asks WHERE focus went first, the way `text/TextEditor`
// does: a trip into the field's own menu is not a commit, leaving it is. That
// handler lives on the WRAPPER, never on the input: focus moving input -> button
// is correctly not a commit, but then the INPUT never blurs again, and a handler
// living on it would strand the typed value forever.
//
// No `inputMode="url"` — the field's commonest legal value is an interpolation
// (`{web.invoice_url}`), and a URL keyboard offers `/` and `.com` rather than a
// brace.

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { planChipInsert } from '../text/declMint';
import type { PendingDecl } from '../text/declModel';
import { InsertFieldMenu } from '../text/InsertFieldMenu';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { type LinkProblem, linkUrlProblem, MAX_LINK_URL_BYTES, spliceAt } from './linkModel';

export interface LinkUrlFieldProps {
  /** Unique within the rendered panel — a module constant is safe only while
   * one such field can be on screen at a time. */
  readonly id: string;
  /** The control's visible label, and therefore its accessible NAME: two link
   * fields on one surface must not answer to the same words. */
  readonly label: string;
  /** The insert menu's own name, for the same reason. */
  readonly insertLabel: string;
  readonly currentUrl: string;
  readonly chips: ChipContext;
  /** The names this item's OTHER surfaces interpolate — what a mint must not
   * take. Which set that is differs per surface, so the caller decides. */
  readonly otherNames: readonly string[];
  /** Applied only for an ACCEPTED url that actually moved; the field owns the
   * refusal and the reseed. */
  readonly commit: (typed: string, pending: readonly PendingDecl[]) => void;
  /** The field's `?`, when it has one. */
  readonly help?: ReactNode;
  /** `[key, reseed]` from `useReseedKey(currentUrl)` — owned by the caller so a
   * host that reseeds for its own reasons shares one nonce. */
  readonly seed: readonly [string, () => void];
}

export function LinkUrlField(props: LinkUrlFieldProps) {
  const { t } = useI18n();
  const { id, label, insertLabel, currentUrl, chips, otherNames, help } = props;
  // The element as STATE, not a ref (the `text/TextEditor` precedent): the
  // insert menu is rendered only once the input exists, so the pick handler
  // closes over an element that cannot be null.
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<LinkProblem | null>(null);
  const [pending, setPending] = useState<readonly PendingDecl[]>([]);
  const [inputKey, reseed] = props.seed;
  // The refusal and the staged declarations describe ONE surface's edit, and
  // this component is reused across surfaces rather than remounted: the
  // fragment list swaps `id`/`label`/`currentUrl` when another fragment is
  // picked, and the item field is likewise not keyed by path. Without this,
  // a refused URL leaves its red box sitting under the NEXT surface's empty
  // field — a valid value under a message saying it is wrong, which is the
  // exact state the `onInput` reset below exists to prevent, one surface over.
  const [surface, setSurface] = useState(id);
  if (surface !== id) {
    setSurface(id);
    setProblem(null);
    setPending([]);
  }

  // Read at pick time from the LIVE input, never from a value captured when
  // this component rendered — the text has moved on with every keystroke since.
  const insert = (el: HTMLInputElement, key: string, documentScoped: boolean) => {
    const planned = planChipInsert(key, documentScoped, {
      scope: chips.scope,
      declared: chips.declared,
      pending,
      text: el.value,
      offeredKeys: [...chips.options, ...chips.documentOptions].map((row) => row.key),
      otherNames,
    });
    const decl = planned.decl;
    if (decl !== null) {
      setPending((staged) => [...staged, decl]);
    }
    const spliced = spliceAt(el.value, el.selectionStart, el.selectionEnd, planned.wire);
    el.value = spliced.value;
    el.focus();
    el.setSelectionRange(spliced.caret, spliced.caret);
  };

  const commit = (typed: string) => {
    const refusal = linkUrlProblem(typed);
    setProblem(refusal);
    if (refusal === null) {
      props.commit(typed, pending);
      setPending([]);
    }
    // Unconditional, exactly as `TextField` does it: a commit can LAND and
    // still not move the value (the trim), and a refusal never moves it, so
    // "did it land?" is the wrong question to key a reseed on.
    if (typed !== currentUrl) {
      reseed();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: blur-delegation wrapper; focus and the textbox role live on the input child.
    <div
      className="mb-2"
      onBlur={
        input === null
          ? undefined
          : (event) => {
              // Focus moving within the field's own chrome (into the insert
              // menu and back) is not a commit; leaving it is. `focusout`
              // bubbles, so the wrapper sees the BUTTON's blur too.
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) {
                return;
              }
              commit(input.value);
            }
      }
    >
      <span className={`${FIELD_LABEL} flex items-center gap-1`}>
        <label htmlFor={id}>{label}</label>
        {help}
      </span>
      <input
        key={inputKey}
        id={id}
        ref={setInput}
        type="text"
        className={`${INPUT} min-w-0`}
        defaultValue={currentUrl}
        placeholder={t('panel.link.placeholder')}
        // The refusal describes the value that was COMMITTED, so the moment the
        // reader starts fixing it the message is about text nobody can see any
        // more — a valid URL under a red box saying it is wrong. React bails
        // out when the state is already null, so this costs one render, not one
        // per keystroke.
        onInput={() => setProblem(null)}
      />
      {problem === null ? null : (
        <output className="mt-0.5 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {problem === 'scheme'
            ? t('panel.link.problem.scheme')
            : t('panel.link.problem.tooLong', { max: MAX_LINK_URL_BYTES })}
        </output>
      )}
      {input === null ? null : (
        <div className="mt-1 flex items-center gap-1">
          <InsertFieldMenu
            chips={chips}
            onInsert={(option, documentScoped) => insert(input, option.key, documentScoped)}
            label={insertLabel}
          />
        </div>
      )}
    </div>
  );
}
