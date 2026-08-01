import { describe, expect, it, vi } from 'vitest';
import { type EventSpec, type EventTable, HookRegistry, type RegistryReporters } from './registry';

// A test-local table: one notification, one provider, one deprecated
// notification (the shipped table is all-active; the deprecation MECHANISM is
// exercised here against a constructed table).
interface TestNotifications extends Record<string, unknown> {
  'init:things': { add(value: string): void };
  'old:event': { add(value: string): void };
}
interface TestProviders extends Record<string, (...args: never[]) => unknown> {
  'load:thing': (key: string) => Promise<string | null>;
}

const ACTIVE_NOTIFICATION: EventSpec = { kind: 'notification', status: 'active' };
const TABLE: EventTable = new Map<string, EventSpec>([
  ['init:things', ACTIVE_NOTIFICATION],
  [
    'old:event',
    {
      kind: 'notification',
      status: { deprecated: { since: '0.1.0', replacement: 'init:things', removedIn: '1.0.0' } },
    },
  ],
  ['load:thing', { kind: 'provider', status: 'active' }],
]);

function makeRegistry(reporters?: RegistryReporters) {
  return new HookRegistry<TestNotifications, TestProviders>(TABLE, reporters);
}

describe('HookRegistry notifications', () => {
  it('fires subscribers in registration order, awaiting each before the next', async () => {
    const registry = makeRegistry();
    const log: string[] = [];
    registry.hook('init:things', async () => {
      log.push('first:start');
      await Promise.resolve();
      log.push('first:end');
    });
    registry.hook('init:things', () => {
      log.push('second');
    });
    await registry.emit('init:things', { add: () => {} });
    expect(log).toEqual(['first:start', 'first:end', 'second']);
  });

  it('emits to zero subscribers as a no-op', async () => {
    const registry = makeRegistry();
    await expect(registry.emit('init:things', { add: () => {} })).resolves.toBeUndefined();
  });

  it('isolates a THROWING subscriber: reported, later subscribers still run', async () => {
    const onError = vi.fn();
    const registry = makeRegistry({ onError });
    const seen: string[] = [];
    registry.hook('init:things', () => {
      throw new Error('bad package');
    });
    registry.hook('init:things', () => {
      seen.push('survivor');
    });
    await registry.emit('init:things', { add: () => {} });
    expect(seen).toEqual(['survivor']);
    expect(onError).toHaveBeenCalledWith('init:things', expect.any(Error));
  });

  it('isolates a REJECTING async subscriber the same way', async () => {
    const onError = vi.fn();
    const registry = makeRegistry({ onError });
    const seen: string[] = [];
    registry.hook('init:things', async () => {
      await Promise.resolve();
      throw new Error('bad async package');
    });
    registry.hook('init:things', () => {
      seen.push('survivor');
    });
    await registry.emit('init:things', { add: () => {} });
    expect(seen).toEqual(['survivor']);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stops delivering to a disposed subscriber; dispose is idempotent', async () => {
    const registry = makeRegistry();
    const seen: string[] = [];
    const dispose = registry.hook('init:things', () => {
      seen.push('disposed');
    });
    registry.hook('init:things', () => {
      seen.push('kept');
    });
    dispose();
    dispose();
    await registry.emit('init:things', { add: () => {} });
    expect(seen).toEqual(['kept']);
  });

  it('reports via console.error by default', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = makeRegistry();
    registry.hook('init:things', () => {
      throw new Error('default-reported');
    });
    await registry.emit('init:things', { add: () => {} });
    expect(spy).toHaveBeenCalledWith('init:things', expect.any(Error));
    spy.mockRestore();
  });
});

describe('HookRegistry providers', () => {
  it('resolves the registered provider and routes a call through it', async () => {
    const registry = makeRegistry();
    registry.hook('load:thing', async (key: string) => `value:${key}`);
    const provider = registry.resolve('load:thing');
    expect(provider).not.toBeNull();
    await expect(provider?.('a')).resolves.toBe('value:a');
  });

  it('resolves null when no provider is registered', () => {
    expect(makeRegistry().resolve('load:thing')).toBeNull();
  });

  it('throws on a second registration (fail-loud single slot)', () => {
    const registry = makeRegistry();
    registry.hook('load:thing', async () => null);
    expect(() => registry.hook('load:thing', async () => null)).toThrowError(
      /already registered for "load:thing"/,
    );
  });

  it('frees the slot on dispose, and a stale dispose never evicts a successor', () => {
    const registry = makeRegistry();
    const first = async () => null;
    const disposeFirst = registry.hook('load:thing', first);
    disposeFirst();
    expect(registry.resolve('load:thing')).toBeNull();
    const second = async () => 'second';
    registry.hook('load:thing', second);
    disposeFirst();
    expect(registry.resolve('load:thing')).toBe(second);
  });
});

describe('HookRegistry event-table discipline', () => {
  it('throws on an unknown event name from hook, emit, and resolve', async () => {
    const registry = makeRegistry();
    const unknown = 'no:such' as 'init:things';
    expect(() => registry.hook(unknown, () => {})).toThrowError(/unknown hook event "no:such"/);
    await expect(registry.emit(unknown, { add: () => {} })).rejects.toThrowError(
      /unknown hook event/,
    );
    expect(() => registry.resolve('no:such' as 'load:thing')).toThrowError(/unknown hook event/);
  });

  it('rejects prototype-chain names — the table is a real Map', () => {
    const registry = makeRegistry();
    for (const hostile of ['constructor', '__proto__', 'toString']) {
      expect(() => registry.hook(hostile as 'init:things', () => {})).toThrowError(
        /unknown hook event/,
      );
    }
  });

  it('refuses emit on a provider event and resolve on a notification event', async () => {
    const registry = makeRegistry();
    await expect(
      registry.emit('load:thing' as unknown as 'init:things', { add: () => {} }),
    ).rejects.toThrowError(/provider event/);
    expect(() => registry.resolve('init:things' as unknown as 'load:thing')).toThrowError(
      /notification event/,
    );
  });
});

describe('HookRegistry deprecation', () => {
  it('warns ONCE per deprecated event, naming the replacement', () => {
    const warn = vi.fn();
    const registry = makeRegistry({ warn });
    registry.hook('old:event', () => {});
    registry.hook('old:event', () => {});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('deprecated since 0.1.0');
    expect(warn.mock.calls[0][0]).toContain('use "init:things" instead');
    expect(warn.mock.calls[0][0]).toContain('removed in 1.0.0');
  });

  it('never warns on an active event', () => {
    const warn = vi.fn();
    const registry = makeRegistry({ warn });
    registry.hook('init:things', () => {});
    registry.hook('load:thing', async () => null);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns via console.warn by default', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = makeRegistry();
    registry.hook('old:event', () => {});
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
