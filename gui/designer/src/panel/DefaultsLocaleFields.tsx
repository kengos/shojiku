// The document-settings half of `defaults:`: the locale and currency the
// document declares. A live view — it re-reads `controller.read('defaults')`
// each render and dispatches a root-addressed named op per edit (AI parity, no
// direct mutation).
//
// Each pick carries a what-this-DOES line, and every value in it is the
// ENGINE's own rendered output, arriving as `facts`. Nothing here formats: a
// sample this file composed could drift from what the page prints, which is
// exactly what a hand-written table of per-locale samples used to risk.
// `facts === null` — no engine answer yet, an engine without the
// `locale.facts` query, a tag it cannot resolve, or a pack this host does not
// ship — means the lines are simply not shown; nothing is guessed.
//
// The preview does NOT follow `defaults.locale`: the WASM host sets the engine
// locale explicitly at preset-open, so the key is only the CLI/MCP render
// fallback — the hint line says so, rather than implying a live effect the GUI
// cannot deliver in v1. That is also why the facts are asked for by TAG rather
// than read off the session: the two are routinely different locales.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import type { LocaleFacts } from '../engine/types';
import { useI18n } from '../i18n/context';
import { ENGINE_ONLY_LOCALES, LOCALES } from '../i18n/locales';
import { ComboField } from './choiceFields';
import { CURRENCY_SUGGESTIONS, currencyOp, localeOp, readDefaultsView } from './defaultsModel';
import { applyPanelOp } from './model';

/** What the `defaults.locale` picker offers: the Designer's own chrome
 * languages, then the engine-resolvable locales that have no chrome catalog
 * (`th-TH` ships a pack but no Thai UI). The two axes and why neither
 * contains the other are documented on `ENGINE_ONLY_LOCALES`. */
const LOCALE_TAGS: readonly string[] = [
  ...LOCALES.map((locale) => locale.tag),
  ...ENGINE_ONLY_LOCALES.filter((tag) => !LOCALES.some((l) => l.tag === tag)),
];

export interface DefaultsLocaleFieldsProps {
  readonly controller: EditorController;
  /** The engine's answer for the picked locale, or `null` to claim nothing. */
  readonly facts: LocaleFacts | null;
}

export function DefaultsLocaleFields({ controller, facts }: DefaultsLocaleFieldsProps) {
  const { t } = useI18n();
  const view = readDefaultsView(controller.read('defaults'));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  // Each line is gated on what IT needs, not on the answer as a whole. The
  // locale line NAMES the default currency code, so a pack that declares none
  // (reported as an empty code — the engine invents nothing) has no such
  // sentence to offer; the amount line needs only the amount, and stays.
  const explained = facts !== null && facts.currencyDefault !== '' ? facts : null;

  return (
    <>
      <ComboField
        label={t('defaults.locale')}
        value={view.locale}
        options={LOCALE_TAGS}
        listId="sj-defaults-locale"
        onCommit={(v) => dispatch(localeOp(v))}
      />
      {explained === null ? null : (
        <p className="-mt-0.5 mb-2 text-sm text-muted">
          {t('defaults.localeFacts', {
            date: explained.date,
            number: explained.number,
            currency: explained.currencyDefault,
          })}
        </p>
      )}
      <p className="-mt-0.5 mb-2 text-sm text-muted">{t('defaults.localeHint')}</p>
      <ComboField
        label={t('defaults.currency')}
        value={view.currency}
        options={CURRENCY_SUGGESTIONS}
        listId="sj-defaults-currency"
        onCommit={(v) => dispatch(currencyOp(v))}
      />
      <p className="-mt-0.5 mb-2 text-sm text-muted">
        {facts === null
          ? t('defaults.currencyHint')
          : t('defaults.currencyFacts', { amount: facts.amount })}
      </p>
    </>
  );
}
