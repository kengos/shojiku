// A tiny ICU-MessageFormat-compatible substitution — an in-repo subset, NOT a
// dependency (the supply-chain posture keeps the Designer dep-light). It covers
// exactly what the diagnostics + chrome catalogs use: `{name}` interpolation,
// `{name, number}` locale-aware numbers, and ICU apostrophe escaping (`''` → a
// literal quote, `'{'` / `'}'` → a literal brace).
//
// Security: a single linear scan, so there is no regex backtracking a hostile
// template could exploit — and an interpolated ARG VALUE is emitted as text and
// NEVER re-scanned, so an arg like `{other}` cannot inject a second placeholder
// (the format-string class of bug). React escaping handles HTML at the render
// site; this layer only produces the string.

export type MessageArgs = Readonly<Record<string, string | number | boolean>>;

/** Format a number for `locale`, retrying under `'en'` if the tag is invalid.
 * A hostile/garbage BCP 47 tag makes `Intl.NumberFormat` throw `RangeError`; a
 * localized number must never blow up the whole message over the locale tag. */
function formatNumber(value: string | number | boolean, locale: string): string {
  const n = Number(value);
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return new Intl.NumberFormat('en').format(n);
  }
}

/** Join `items` as a locale-aware "and" list (`a, b, and c` / `a、b、c`),
 * retrying under `'en'` if the tag is invalid — the same hostile-tag posture
 * [`formatNumber`] takes. Chrome that names a SET of things (which columns a
 * header group spans) reads naturally in every locale this way, instead of one
 * component baking a single language's separator into the string. */
export function formatList(items: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale).format(items);
  } catch {
    return new Intl.ListFormat('en').format(items);
  }
}

/** Format `template` against `args` for `locale`. Returns `null` when the
 * template references an arg the diagnostic did not carry — the caller then
 * falls back to the engine's English `message` rather than showing a raw
 * `{placeholder}`. */
export function formatMessage(template: string, args: MessageArgs, locale: string): string | null {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "'") {
      const next = template[i + 1];
      if (next === "'") {
        out += "'";
        i += 2;
        continue;
      }
      if (next === '{' || next === '}') {
        // ICU quoting: an apostrophe before `{`/`}` opens a quoted literal that
        // runs until the next apostrophe (consumed), so `'{'` yields a literal
        // brace. An unterminated quote runs to the end of the template.
        i += 1;
        while (i < template.length && template[i] !== "'") {
          out += template[i];
          i += 1;
        }
        i += 1;
        continue;
      }
      // An apostrophe not doubled and not before a brace is a literal
      // apostrophe (matching ICU: quoting only starts before a syntax char).
      out += "'";
      i += 1;
      continue;
    }
    if (ch === '{') {
      const end = template.indexOf('}', i);
      if (end === -1) {
        // An unbalanced brace is emitted literally rather than swallowing the
        // rest of the template.
        out += ch;
        i += 1;
        continue;
      }
      const token = template.slice(i + 1, end);
      const comma = token.indexOf(',');
      const name = (comma === -1 ? token : token.slice(0, comma)).trim();
      const format = comma === -1 ? '' : token.slice(comma + 1).trim();
      // Own-property check: an arg named like `toString` must not resolve
      // through the prototype chain.
      if (!Object.hasOwn(args, name)) {
        return null;
      }
      const value = args[name];
      out += format === 'number' ? formatNumber(value, locale) : String(value);
      i = end + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
