import { describe, expect, it, vi } from 'vitest';
import type { RawPage } from '../engine/types';
import { paintPage } from './paint';

const page = (): RawPage => ({ width: 2, height: 1, rgba: new Uint8Array(2 * 1 * 4) });

function fakeCanvas(ctx: unknown): HTMLCanvasElement {
  return { getContext: () => ctx } as unknown as HTMLCanvasElement;
}

describe('paintPage', () => {
  it('no-ops when the canvas has no 2D context', () => {
    expect(() => paintPage(fakeCanvas(null), page())).not.toThrow();
  });

  it('puts the RGBA image when a 2D context is present', () => {
    const putImageData = vi.fn();
    paintPage(fakeCanvas({ putImageData }), page());
    expect(putImageData).toHaveBeenCalledOnce();
  });
});
