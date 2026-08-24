// The "used in N places" line, in the ONE place that decides its plural form.
//
// The message formatter is a deliberate ICU SUBSET (`{name}` and
// `{name, number}` — no `plural` arm), so a count string picks its own key.
// Two keys is enough for every language shipped: en/hi/fil distinguish one
// from other, and ja/zh have a single form that reads correctly either way. A
// locale with more plural categories would want `plural` in the formatter
// instead — that is the moment to grow it, not before.
//
// Shared by both registry rows and the style picker so the rule lives once; a
// sixth caller gets it for free rather than inventing a sixth ternary.

/** The localized reference-count label for `count` (which callers only render
 * when it is non-zero — an unused entry has its own wording). */
export function usageLabel(
  t: (key: string, args?: Readonly<Record<string, string | number | boolean>>) => string,
  count: number,
): string {
  return t(count === 1 ? 'toolbar.styles.usageOne' : 'toolbar.styles.usage', { n: count });
}
