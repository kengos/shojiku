// Localized wording for the style enums' WIRE spellings. The engine's vocabulary
// (`normal` / `bold` / `italic` / `left` …) is what gets authored and what an AI
// emits, but it is not what the nontech-pm reads — a thickness picker offering
// 「normal / bold」 asks them to know English typography terms. These helpers map
// spelling → catalog key so every surface that renders a style enum shows the
// same localized wording while still committing the wire spelling.
//
// Closed vocabulary: the keys come from `STYLE_FIELDS`' own option lists, so a
// lookup can never be handed an attacker string — but the tables are still
// own-property-guarded, since a style key reaching here comes from a document.

/** `style.value.<field>.<spelling>` for every enum option `STYLE_FIELDS` offers.
 * A field/spelling pair with no entry falls back to the wire spelling, so a new
 * engine variant degrades to its spelling rather than to a raw catalog key. */
const OPTION_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  fontWeight: {
    normal: 'style.value.fontWeight.normal',
    bold: 'style.value.fontWeight.bold',
  },
  fontStyle: {
    normal: 'style.value.fontStyle.normal',
    italic: 'style.value.fontStyle.italic',
  },
  textAlign: {
    left: 'style.value.textAlign.left',
    center: 'style.value.textAlign.center',
    right: 'style.value.textAlign.right',
  },
};

/** A translate function of the shape `useI18n().t`. */
export type Translate = (key: string, args?: Record<string, string | number>) => string;

/** The localized wording for one enum option, or the wire spelling when the
 * field/option is not one this table covers. */
export function styleOptionLabel(t: Translate, field: string, option: string): string {
  if (!Object.hasOwn(OPTION_KEYS, field)) {
    return option;
  }
  const perField = OPTION_KEYS[field];
  return Object.hasOwn(perField, option) ? t(perField[option]) : option;
}

/** The label for a defaults-surface select's UNSET option. The document has
 * authored nothing, so the option says so AND names the value the engine will
 * use — the state the old surface expressed by filling the box with that value
 * under a default-looking tag, which read as a setting the user had made. */
export function unsetLabel(t: Translate, field: string, engineDefault: string | undefined): string {
  return engineDefault === undefined
    ? t('defaults.unset')
    : t('defaults.unsetWith', { value: styleOptionLabel(t, field, engineDefault) });
}
