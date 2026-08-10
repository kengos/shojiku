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

/** A refined catalog key for diagnostics whose ARGS distinguish a case the one
 * engine code cannot: `<code>.<variant>`, tried before the bare code. The
 * engine wire is untouched — a variant is a WORDING decision, which is the
 * React side's to make.
 *
 * One rule today. `unknown_data_key` is the message the panel shows while a
 * data-binding field sits empty (clearing the field deliberately keeps the key
 * present-but-empty so the problem stays visible), and the generic wording then
 * echoes the empty key back: "data key `` is not declared in …". What the user
 * needs there is to be told to pick a key.
 *
 * Returns `null` when no variant applies, so the ordinary lookup runs. */
export function variantKey(diag: Diagnostic): string | null {
  if (diag.code === 'unknown_data_key' && diag.args.key === '') {
    return 'unknown_data_key.empty';
  }
  return null;
}

/** Render a diagnostic's human message from `code` + `args` through the chain.
 * A [`variantKey`] refinement is tried first, then the bare code. The engine's
 * English `message` is the fallback when no catalog language in the chain
 * carries either (an append-only newer code, or a partial catalog) or the
 * localized template references an arg the diagnostic did not carry — NEVER the
 * raw template, and the engine `message` is never parsed. `origin` is not
 * consulted here (a GUI hides it). */
export function renderDiagnostic(
  diag: Diagnostic,
  catalog: Catalog,
  chain: readonly string[],
  formatLocale: string,
): string {
  const variant = variantKey(diag);
  const keys = variant === null ? [diag.code] : [variant, diag.code];
  for (const key of keys) {
    const template = lookup(catalog, chain, 'diagnostics', key);
    if (template !== undefined) {
      const formatted = formatMessage(template, diag.args, formatLocale);
      if (formatted !== null) {
        return formatted;
      }
    }
  }
  return diag.message;
}
