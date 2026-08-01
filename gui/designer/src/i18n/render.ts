// Pure rendering of catalog entries against a resolved language chain: chrome
// strings by key, diagnostics by `code` + typed `args`. Kept free of React so
// the chain-walk + substitution + fallback logic is exhaustively unit-testable;
// the context (`useI18n`) wires it to a provider and supplies the chain.
//
// `chain` is the ordered output of `resolveChain` (most specific first, ending
// at `en`); `formatLocale` is the ORIGINAL requested BCP 47 tag, used only for
// `{n, number}` grouping (which is independent of which language's string won).

import type { Diagnostic } from '../engine/types';
import type { Catalog } from './catalog';
import { formatMessage, type MessageArgs } from './format';

/** Walk the chain and return the first language that OWNS `key` in `section` —
 * the per-key sparse-overlay lookup (a regional/partial catalog fills only the
 * keys it defines; the rest fall through, ending at English). Every access is
 * `hasOwn`-guarded so a hostile language key or arg name cannot prototype-walk. */
function lookup(
  catalog: Catalog,
  chain: readonly string[],
  section: 'chrome' | 'diagnostics',
  key: string,
): string | undefined {
  for (const lang of chain) {
    if (!Object.hasOwn(catalog, lang)) {
      continue;
    }
    const table = catalog[lang][section];
    if (Object.hasOwn(table, key)) {
      return table[key];
    }
  }
  return undefined;
}

/** Render a chrome string. An unknown key renders as the key itself (a visible
 * dev signal, never a blank); a template whose args are missing falls back to
 * the English wording rather than a raw `{placeholder}`. */
export function translate(
  catalog: Catalog,
  chain: readonly string[],
  key: string,
  formatLocale: string,
  args: MessageArgs = {},
): string {
  const template = lookup(catalog, chain, 'chrome', key);
  if (template === undefined) {
    return key;
  }
  const formatted = formatMessage(template, args, formatLocale);
  if (formatted !== null) {
    return formatted;
  }
  return lookup(catalog, ['en'], 'chrome', key) ?? template;
}

/** Render a diagnostic's human message from `code` + `args` through the chain.
 * The engine's English `message` is the fallback when no catalog language in the
 * chain carries the code (an append-only newer code, or a partial catalog) or
 * the localized template references an arg the diagnostic did not carry — NEVER
 * the raw template, and the engine `message` is never parsed. `origin` is not
 * consulted here (a GUI hides it). */
export function renderDiagnostic(
  diag: Diagnostic,
  catalog: Catalog,
  chain: readonly string[],
  formatLocale: string,
): string {
  const template = lookup(catalog, chain, 'diagnostics', diag.code);
  if (template !== undefined) {
    const formatted = formatMessage(template, diag.args, formatLocale);
    if (formatted !== null) {
      return formatted;
    }
  }
  return diag.message;
}
