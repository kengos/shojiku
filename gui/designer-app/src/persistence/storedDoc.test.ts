// Tests for storedDoc.ts — the untrusted payload-field vocabulary shared by
// the draft, snapshot and mounted-host readers. `parseStoredSample` (the
// sample-variant set guard) is pinned through the draft/snapshot suites that
// feed it stored envelopes.
import { describe, expect, it } from 'vitest';
import type { InstalledFont } from '../fonts/library';
import { isInstalledFont } from './storedDoc';

const lato: InstalledFont = {
  packId: 'gf-lato',
  familyId: 'gf-lato',
  displayName: 'Lato',
  manifest: 'version: 1\n',
  licenseFile: 'OFL.txt',
  licenseText: 'Copyright (c) Lato',
};

describe('isInstalledFont', () => {
  it('accepts the persisted font shape and rejects everything else', () => {
    expect(isInstalledFont(lato)).toBe(true);
    expect(isInstalledFont(null)).toBe(false);
    expect(isInstalledFont('gf-lato')).toBe(false);
    expect(isInstalledFont({ ...lato, licenseText: 7 })).toBe(false);
  });
});
