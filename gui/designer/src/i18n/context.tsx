// The i18n host-injection point: locale + message catalog provided via context
// so a host can override chrome wording (or the whole catalog) without the
// component reaching around to an app concern. `locale` is a full BCP 47 tag
// (`ja-JP`, `zh-Hant-TW`, `en-AU`); it is resolved once to a language chain and
// the original tag drives number grouping. Defaults to the built-in catalog.
// Consumers call `useI18n()` for `t` (chrome) and `describe` (diagnostics).

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { Diagnostic } from '../engine/types';
import { type Catalog, DEFAULT_CATALOG } from './catalog';
import type { MessageArgs } from './format';
import { renderDiagnostic, translate } from './render';
import { resolveChain } from './resolve';

interface I18nContextValue {
  readonly locale: string;
  readonly catalog: Catalog;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** A full BCP 47 locale tag (`ja-JP`, `zh-Hant-TW`, `en-AU`, `de-DE`, …).
   * Unknown/hostile tags degrade to English without throwing. */
  readonly locale: string;
  readonly catalog?: Catalog;
  readonly children: ReactNode;
}

export function I18nProvider({ locale, catalog = DEFAULT_CATALOG, children }: I18nProviderProps) {
  const value = useMemo<I18nContextValue>(() => ({ locale, catalog }), [locale, catalog]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export interface I18n {
  /** The requested BCP 47 tag, verbatim. */
  readonly locale: string;
  /** The resolved primary catalog language actually driving the strings. */
  readonly language: string;
  /** Render a chrome string by catalog key, with optional interpolation args. */
  t(key: string, args?: MessageArgs): string;
  /** Render a diagnostic's localized message (code + args, English fallback). */
  describe(diag: Diagnostic): string;
}

/** Read the injected i18n. Throws when used outside an `<I18nProvider>` (a
 * wiring bug, not a document error). */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (ctx === null) {
    throw new Error('useI18n must be used within an <I18nProvider>');
  }
  return useMemo<I18n>(() => {
    const chain = resolveChain(ctx.locale);
    const language = chain.find((lang) => Object.hasOwn(ctx.catalog, lang)) ?? 'en';
    return {
      locale: ctx.locale,
      language,
      t: (key, args) => translate(ctx.catalog, chain, key, ctx.locale, args),
      describe: (diag) => renderDiagnostic(diag, ctx.catalog, chain, ctx.locale),
    };
  }, [ctx]);
}
