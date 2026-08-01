import { describe, expect, it } from 'vitest';
import { hasCapability } from './itemPanelProps';

describe('hasCapability', () => {
  it('trusts the engine when the host injected NO capability list', () => {
    // An absent list means the bundled engine, which has every key the GUI
    // gates on — never version-sniff, and never fail closed here.
    expect(hasCapability(undefined, 'style.border')).toBe(true);
  });

  it('admits a key the engine reports', () => {
    expect(hasCapability(['style.border', 'style.borderRadius'], 'style.border')).toBe(true);
  });

  it('refuses a key an OLDER engine does not report', () => {
    expect(hasCapability(['style.border'], 'style.borderRadius')).toBe(false);
  });

  it('refuses every key against an empty list (a list is not "absent")', () => {
    // The empty-vs-undefined distinction is the whole gate: [] is an engine
    // that reported nothing, undefined is a host that reported nothing.
    expect(hasCapability([], 'style.border')).toBe(false);
  });

  it('does not match a key by prefix', () => {
    expect(hasCapability(['style.border'], 'style.border.sides')).toBe(false);
  });
});
