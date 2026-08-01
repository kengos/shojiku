import { describe, expect, it } from 'vitest';
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
});
