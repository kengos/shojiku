// Shared font-flow test helpers: the pinned Lato install, a fake
// FontController, and an EnginePrep carrying it. Test substrate only —
// excluded from coverage.
import { vi } from 'vitest';
import type { EnginePrep } from '../app/services';
import type { FontController } from '../fonts/controller';
import type { InstalledFont } from '../fonts/library';
import { clean, makePrep, resolvingFonts } from './fixtures';

export const LATO_FONT: InstalledFont = {
  packId: 'gf-lato',
  familyId: 'gf-lato',
  displayName: 'Lato',
  manifest: 'version: 1\n',
  licenseFile: 'OFL.txt',
  licenseText: 'Copyright (c) Lato',
};

export function fakeController(overrides: Partial<Record<string, unknown>> = {}): FontController {
  let installed: readonly InstalledFont[] = [];
  return {
    familyIds: () => installed.map((f) => f.familyId),
    list: () => installed,
    exportOverlay: () => 'fonts:\n  uses: [noto-sans, gf-lato]\n',
    pick: vi.fn(async () => {
      installed = [LATO_FONT];
    }),
    restore: vi.fn(async (fonts: readonly InstalledFont[]) => {
      installed = fonts;
    }),
    ...overrides,
  } as unknown as FontController;
}

export function prepWithFonts(fonts: FontController | null): EnginePrep {
  const base = makePrep(clean, resolvingFonts(), []);
  return { ...base, fonts };
}
