// Tests for singleton.ts — the module-level `ShojikuGui` instance integrator
// packages register into at import time: a HookRegistry over the shipped table.
import { describe, expect, it } from 'vitest';
import { HookRegistry } from './registry';
import { ShojikuGui } from './singleton';

describe('the ShojikuGui singleton', () => {
  it('is a HookRegistry over the shipped table', async () => {
    expect(ShojikuGui).toBeInstanceOf(HookRegistry);
    const seen: string[] = [];
    const dispose = ShojikuGui.hook('init:fonts', () => {
      seen.push('fired');
    });
    await ShojikuGui.emit('init:fonts', { addSource: () => {} });
    dispose();
    await ShojikuGui.emit('init:fonts', { addSource: () => {} });
    expect(seen).toEqual(['fired']);
  });

  it('rejects an unknown event name', () => {
    expect(() => ShojikuGui.hook('boot:everything' as 'init:fonts', () => {})).toThrowError(
      /unknown hook event/,
    );
  });
});
