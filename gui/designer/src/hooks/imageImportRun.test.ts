// restoreImageSource — the size gate a remembered `src` passes before the panel
// writes it back (ops never re-check the cap, and undo/redo must stay able to
// re-parse), counted in the cap's own unit: UTF-8 bytes.

import type { Op } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import { projectImport } from '../image/capacity';
import { restoreImageSource } from './imageImportRun';

const P = 'sections.body.items[0]';
const MIB = 1024 * 1024;

function context(textBytes: number, maxBytes: number) {
  return {
    textBytes,
    maxBytes,
    applyAll: vi.fn((_ops: readonly Op[]) => ({ ok: true as const })),
    setNotice: vi.fn(),
  };
}

describe('restoreImageSource', () => {
  it('writes the src and drops the binding in one batch when it fits', () => {
    const ctx = context(100, 2 * MIB);
    restoreImageSource(P, 'logo.svg', ctx);
    expect(ctx.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: P, keys: ['data'] },
      { op: 'setScalar', path: P, keys: ['src'], value: 'logo.svg' },
    ]);
    expect(ctx.setNotice).toHaveBeenLastCalledWith(null);
  });

  it('refuses over the cap with the raise notice, writing nothing', () => {
    const ctx = context(2 * MIB, 2 * MIB);
    restoreImageSource(P, 'logo.svg', ctx);
    expect(ctx.applyAll).not.toHaveBeenCalled();
    expect(ctx.setNotice).toHaveBeenLastCalledWith('image.notice.overCap');
  });

  it('says the ceiling is reached when no larger cap exists', () => {
    const ctx = context(8 * MIB, 8 * MIB);
    restoreImageSource(P, 'logo.svg', ctx);
    expect(ctx.applyAll).not.toHaveBeenCalled();
    expect(ctx.setNotice).toHaveBeenLastCalledWith('image.notice.atMax');
  });

  it('counts UTF-8 bytes, not UTF-16 units', () => {
    // Six kana: 6 units, 18 bytes. A cap with room for 6 but not 18 must refuse.
    const src = 'ロゴロゴロゴ';
    const max = 2 * MIB;
    // Exactly full when counted in units: the projection's own overhead included.
    const textBytes = max - projectImport(0, src.length, max).projectedBytes;
    expect(projectImport(textBytes, src.length, max).fits).toBe(true);
    const ctx = context(textBytes, max);
    restoreImageSource(P, src, ctx);
    expect(ctx.applyAll).not.toHaveBeenCalled();
    expect(ctx.setNotice).toHaveBeenLastCalledWith('image.notice.overCap');
  });
});
