import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG } from '../i18n/catalog';
import { GLOSSARY_TERMS } from './glossaryModel';

describe('GLOSSARY_TERMS', () => {
  it('pairs a term key with a definition key under the glossary namespace', () => {
    expect(GLOSSARY_TERMS.length).toBeGreaterThan(0);
    for (const entry of GLOSSARY_TERMS) {
      expect(entry.term.startsWith('glossary.')).toBe(true);
      expect(entry.term.endsWith('.term')).toBe(true);
      expect(entry.def).toBe(entry.term.replace(/\.term$/, '.def'));
    }
  });

  it('carries the margin box — the term the placement help links to', () => {
    expect(GLOSSARY_TERMS).toContainEqual({
      term: 'glossary.marginBox.term',
      def: 'glossary.marginBox.def',
    });
  });

  it('the margin-box definition carries BOTH frames', () => {
    // The container popover is one sentence and defers the rest to here, so this
    // entry is the only place saying that an element inside a container counts
    // from that container — and that the container, not the paper, reports it.
    const def = DEFAULT_CATALOG.en.chrome['glossary.marginBox.def'];
    expect(def).toMatch(/band or absolutely-placed element/);
    expect(def).toMatch(/inside a container counts from the top-left of that container/);
    // …and that the CONTAINER, not the paper, is what reports an overrun there.
    expect(def).toMatch(/the container, not the paper, that reports it/);
  });

  it('resolves every listed key in the catalog', () => {
    // A term whose keys are absent renders as the raw key in the dialog.
    const chrome = DEFAULT_CATALOG.en.chrome;
    for (const entry of GLOSSARY_TERMS) {
      expect(entry.term in chrome, entry.term).toBe(true);
      expect(entry.def in chrome, entry.def).toBe(true);
    }
  });
});
