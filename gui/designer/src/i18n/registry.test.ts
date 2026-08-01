// @vitest-environment node
//
// The catalog-completeness gate against the engine's append-only diagnostic
// registry: it reads `engine/diagnostics/src/code.rs` (the source of truth) and
// asserts EVERY FULL language covers EVERY wire code. A newly shipped engine
// code without a catalog entry reds here, catching the drift at the source
// rather than as an English-fallback surprise in the GUI. Partial languages
// (chrome-only, e.g. hi/fil) are exempt by design — they fall through to English
// per key. (Node env: it reads the file off disk, like the round-trip suite.)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG } from './catalog';

const CODE_RS = fileURLToPath(
  new URL('../../../../engine/diagnostics/src/code.rs', import.meta.url),
);

// Languages that promise a complete diagnostics set (vs. chrome-only overlays).
const FULL_LANGUAGES = ['en', 'ja', 'zh-tw', 'zh-cn'] as const;

function engineCodes(): string[] {
  const src = readFileSync(CODE_RS, 'utf8');
  return [...src.matchAll(/=\s*"([a-z_]+)",\s*(?:Error|Warning|Info),/g)].map((m) => m[1]);
}

describe('diagnostics catalog covers the engine registry', () => {
  it('every full language has an entry for every engine diagnostic code', () => {
    const codes = engineCodes();
    expect(codes.length).toBeGreaterThan(80);
    for (const lang of FULL_LANGUAGES) {
      const table = DEFAULT_CATALOG[lang].diagnostics;
      const missing = codes.filter((code) => !(code in table));
      expect(missing, `${lang} missing diagnostics`).toEqual([]);
    }
  });
});

describe('chrome catalog parity', () => {
  // Chrome is the whole GUI's own strings, so every shipped language carries the
  // complete set (unlike diagnostics, which hi/fil leave to English). A key
  // added to `en` but not the rest would render as the raw key for that locale.
  it('every language defines every chrome key `en` defines', () => {
    const keys = Object.keys(DEFAULT_CATALOG.en.chrome);
    for (const lang of Object.keys(DEFAULT_CATALOG)) {
      const chrome = DEFAULT_CATALOG[lang].chrome;
      const missing = keys.filter((key) => !(key in chrome));
      expect(missing, `${lang} missing chrome keys`).toEqual([]);
    }
  });
});
