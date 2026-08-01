// The document-settings half of `defaults:`: the locale and currency the
// document declares. A live view — it re-reads `controller.read('defaults')`
// each render and dispatches a root-addressed named op per edit (AI parity, no
// direct mutation).
//
// Each pick carries a what-this-DOES line read from the engine's own pack data,
// so the choice is made on its effect rather than on a tag. The preview does NOT
// follow `defaults.locale`: the WASM host sets the engine locale explicitly at
// preset-open, so the key is only the CLI/MCP render fallback — the hint line
// says so, rather than implying a live effect the GUI cannot deliver in v1.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { LOCALES } from '../i18n/locales';
import { ComboField } from './choiceFields';
import { CURRENCY_SUGGESTIONS, currencyOp, localeOp, readDefaultsView } from './defaultsModel';
import { amountSample, localeFacts } from './localeFacts';
import { applyPanelOp } from './model';

const LOCALE_TAGS: readonly string[] = LOCALES.map((locale) => locale.tag);

/** The engine-resolvable tag an authored `defaults.locale` formats through: a
 * regional English (`en-GB`) resolves to the locale the engine actually has
 * (`en-US`). An unregistered / hostile tag maps to itself, so the facts lookup
 * simply misses and nothing is claimed about it. */
function engineLocaleFor(tag: string): string {
  return LOCALES.find((locale) => locale.tag === tag)?.engineLocale ?? tag;
}

export interface DefaultsLocaleFieldsProps {
  readonly controller: EditorController;
}

export function DefaultsLocaleFields({ controller }: DefaultsLocaleFieldsProps) {
  const { t } = useI18n();
  const view = readDefaultsView(controller.read('defaults'));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);

  // What the picked locale/currency actually DO, from the engine's own pack data
  // (null for an unset or unresolvable tag — nothing is claimed then).
  const facts = localeFacts(engineLocaleFor(view.locale));

  return (
    <>
      <ComboField
        label={t('defaults.locale')}
        value={view.locale}
        options={LOCALE_TAGS}
        listId="sj-defaults-locale"
        onCommit={(v) => dispatch(localeOp(v))}
      />
      {facts === null ? null : (
        <p className="-mt-0.5 mb-2 text-sm text-muted">
          {t('defaults.localeFacts', {
            date: facts.date,
            number: facts.number,
            currency: facts.currencyDefault,
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
          : t('defaults.currencyFacts', {
              amount: amountSample(
                facts,
                view.currency === '' ? facts.currencyDefault : view.currency,
              ),
            })}
      </p>
    </>
  );
}
