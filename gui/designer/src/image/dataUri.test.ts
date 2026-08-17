// Tests for dataUri.ts — the `data:` URI an inserted image travels as
// (hand-rolled base64 over the injected bytes).
import { describe, expect, it } from 'vitest';
import { composeDataUri } from './dataUri';

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('composeDataUri', () => {
  it('encodes the classic base64 vectors with correct padding', () => {
    expect(composeDataUri('png', utf8('Man'))).toBe('data:image/png;base64,TWFu');
    expect(composeDataUri('jpeg', utf8('Ma'))).toBe('data:image/jpeg;base64,TWE=');
    expect(composeDataUri('svg', utf8('M'))).toBe('data:image/svg+xml;base64,TQ==');
  });

  it('carries the right MIME for the verbatim kinds', () => {
    expect(composeDataUri('gif', utf8('Man'))).toBe('data:image/gif;base64,TWFu');
    expect(composeDataUri('webp', utf8('Man'))).toBe('data:image/webp;base64,TWFu');
  });

  it('encodes a ~1 MiB payload without a stack overflow', () => {
    const big = new Uint8Array(1024 * 1024).fill(0x41);
    const uri = composeDataUri('png', big);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    // base64 of N bytes is ceil(N/3)*4 chars.
    const payload = uri.slice('data:image/png;base64,'.length);
    expect(payload.length).toBe(Math.ceil(big.length / 3) * 4);
  });
});
