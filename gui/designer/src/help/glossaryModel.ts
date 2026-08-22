// The glossary term list (pure data), rendered by GlossaryDialog. Each entry is
// a pair of catalog keys — the term name and its ≤2-sentence definition — so the
// dialog stays a thin map over localized strings. Deliberately small: only the
// concepts a non-engineer author repeatedly stumbles on.

export interface GlossaryEntry {
  /** Catalog key for the term name. */
  readonly term: string;
  /** Catalog key for the definition. */
  readonly def: string;
}

export const GLOSSARY_TERMS: readonly GlossaryEntry[] = [
  { term: 'glossary.field.term', def: 'glossary.field.def' },
  { term: 'glossary.marginBox.term', def: 'glossary.marginBox.def' },
  { term: 'glossary.grid.term', def: 'glossary.grid.def' },
  { term: 'glossary.style.term', def: 'glossary.style.def' },
  { term: 'glossary.default.term', def: 'glossary.default.def' },
  { term: 'glossary.interpolation.term', def: 'glossary.interpolation.def' },
  { term: 'glossary.units.term', def: 'glossary.units.def' },
];
