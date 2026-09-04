// The hyperlink field on the CONTENT tab — the Designer's only surface for
// `link: { url }`, and the only place the fact can exist at all: a link is a PDF
// `/URI` annotation, `render-png` paints none, and the box index carries no link
// either, so neither the preview nor the canvas overlay can show one. Ten of the
// bundled examples author a link that until now the Designer could not display,
// let alone edit.
//
// It carries BOTH its gates, like `CharGridMarkupField`: the TYPE test, because
// only `text` and `image` have the key on the wire, and the CAPABILITY test,
// because an older engine rejects `link:` at parse.
//
// It does NOT use the shared `TextField`, and the reason is the insert menu.
// `TextField` commits on blur and reseeds whenever the typed text differs — and
// clicking the menu IS a blur, so it would commit the half-typed URL and remount
// the input, destroying the caret the insertion needs before the menu had even
// opened. So the blur asks WHERE focus went first, the way `text/TextEditor`
// does: a trip into the field's own menu is not a commit, leaving it is.
//
// No `inputMode="url"` — the field's commonest legal value is an interpolation
// (`{web.invoice_url}`), and a URL keyboard offers `/` and `.com` rather than a
// brace.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { planChipInsert } from '../text/declMint';
import { linkSurfaceNames, type PendingDecl, readItem } from '../text/declModel';
import { InsertFieldMenu } from '../text/InsertFieldMenu';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import {
  LINK_CAPABILITY,
  LINK_TYPES,
  type LinkProblem,
  linkUrlProblem,
  MAX_LINK_URL_BYTES,
  readLinkUrl,
  spliceAt,
} from './linkModel';
import { linkCommitOps } from './linkOps';
import { chipsFor, FieldHelp } from './panelHelpers';
import type { PickerOption } from './pickerModel';
import { useReseedKey } from './useReseedKey';

/** One item is selected at a time, so a constant ties the label to its input
 * (the `TEXT_HINT_ID` precedent in `ContentSection`). */
const URL_INPUT_ID = 'sj-link-url';

export function LinkField(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, capabilities } = props;
  // The element as STATE, not a ref (the `text/TextEditor` precedent): the
  // insert menu is rendered only once the input exists, so the pick handler
  // closes over an element that cannot be null.
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<LinkProblem | null>(null);
  const [pending, setPending] = useState<readonly PendingDecl[]>([]);
  const currentUrl = readLinkUrl(controller.read, path);
  const [inputKey, reseed] = useReseedKey(currentUrl);
  const chips = chipsFor(props);
  if (!LINK_TYPES.has(view.type) || !hasCapability(capabilities, LINK_CAPABILITY)) {
    return null;
  }

  // Read at pick time from the LIVE input, never from a value captured when
  // this component rendered — the text has moved on with every keystroke since.
  const insert = (el: HTMLInputElement, option: PickerOption, documentScoped: boolean) => {
    const planned = planChipInsert(option.key, documentScoped, {
      scope: chips.scope,
      declared: chips.declared,
      pending,
      text: el.value,
      offeredKeys: [...chips.options, ...chips.documentOptions].map((row) => row.key),
      // NOT `chips.otherNames`: that set is built for the TEXT surface, so it
      // holds this item's own `link.url` and omits its `text:`. Minting from
      // it would reserve the URL being edited and leave the item's static text
      // free to be redirected — the exact defect one declaration map per item
      // makes possible.
      otherNames: [...linkSurfaceNames(readItem(controller.read, path))],
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
      const ops = linkCommitOps({ read: controller.read, path, currentUrl, next: typed, pending });
      // NOT unconditional: `applyAll([])` reports ok and BUMPS THE REVISION, so
      // dispatching the empty batch an unchanged blur produces would mint a
      // document revision — and a dirty flag — for a tab-through that authored
      // nothing.
      if (ops.length > 0) {
        controller.applyAll(ops);
      }
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
    // The blur handler is on the WRAPPER, not on the input, and it has to be:
    // focus moving input -> insert button is correctly not a commit, but then
    // the INPUT never blurs again, so a handler living on it would strand the
    // typed value forever with nothing committed and nothing said. `focusout`
    // bubbles, so the wrapper sees focus leaving the button too. Attached only
    // once the input exists, which is what keeps the value non-null without a
    // guard nothing can reach.
    // biome-ignore lint/a11y/noStaticElementInteractions: blur-delegation wrapper; focus and the textbox role live on the input child.
    <div
      className="mb-2"
      onBlur={
        input === null
          ? undefined
          : (event) => {
              // Focus moving within the field's own chrome (into the insert
              // menu and back) is not a commit; leaving it is.
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) {
                return;
              }
              commit(input.value);
            }
      }
    >
      <span className={`${FIELD_LABEL} flex items-center gap-1`}>
        <label htmlFor={URL_INPUT_ID}>{t('panel.link.label')}</label>
        <FieldHelp topic="link" />
      </span>
      <input
        key={inputKey}
        id={URL_INPUT_ID}
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
            onInsert={(option, documentScoped) => insert(input, option, documentScoped)}
            label={t('panel.link.insert')}
          />
        </div>
      )}
    </div>
  );
}
