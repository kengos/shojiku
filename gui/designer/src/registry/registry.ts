// The subscriber-style hook registry mechanism: `hook(event, fn)` over a
// CLOSED, append-only event table. Two kinds — a notification event fans out
// to every subscriber in registration order (awaited sequentially so firing
// order is deterministic; a throw/rejection is isolated per subscriber and
// reported, never a boot crash), while a provider event holds a SINGLE
// request-response implementation (fail-closed: a second registration throws
// at registration time, and call errors propagate to the caller — the seam's
// typed outcomes stay the provider's own contract). The event table is data:
// the concrete v1 events live in events.ts, and tests construct instances
// over their own tables. The Designer component never reads the registry —
// hosts compose collected contributions into the existing services/props.

/** Undo one `hook()` registration. Idempotent; disposing a provider frees its
 * slot for a later registration. */
export type Dispose = () => void;

/** Deprecation metadata, ActiveSupport::Deprecation style: registration on a
 * deprecated event warns ONCE per event with the replacement spelled out.
 * Removal only lands across a major version after a deprecation window. */
export interface DeprecatedStatus {
  readonly deprecated: {
    readonly since: string;
    readonly replacement: string;
    readonly removedIn: string;
  };
}

export type EventStatus = 'active' | DeprecatedStatus;

export type HookKind = 'notification' | 'provider';

/** One event-table entry. The table (name → spec) is the append-only registry
 * of hookable events — the same governance posture as the engine's diagnostics
 * code registry: names and payload keys are only ever added, never repurposed. */
export interface EventSpec {
  readonly kind: HookKind;
  readonly status: EventStatus;
}

/** The closed set of hookable events. A real `Map`, so a hostile or mistyped
 * event name (`constructor`, `__proto__`) can never resolve via the prototype
 * chain — an unknown name throws. */
export type EventTable = ReadonlyMap<string, EventSpec>;

/** Host-injectable reporting: `warn` carries deprecation warnings (default
 * `console.warn`), `onError` carries an isolated notification-subscriber
 * failure (default `console.error`). */
export interface RegistryReporters {
  readonly warn?: (message: string) => void;
  readonly onError?: (event: string, error: unknown) => void;
}

/** The widest function shape a provider slot can hold (parameters
 * contravariant, so every concrete provider signature is assignable). */
export type AnyProviderFn = (...args: never[]) => unknown;

type NotificationFn = (ctx: never) => void | Promise<void>;

/**
 * The registry over one event table. `NMap` types each notification event's
 * context payload; `PMap` types each provider event's call signature — the
 * concrete v1 maps live in events.ts and `ShojikuGui` (singleton.ts) is the
 * instance integrator packages import.
 */
export class HookRegistry<NMap, PMap extends { [K in keyof PMap]: AnyProviderFn }> {
  private readonly table: EventTable;
  private readonly warn: (message: string) => void;
  private readonly report: (event: string, error: unknown) => void;
  private readonly subscribers = new Map<string, NotificationFn[]>();
  private readonly providers = new Map<string, AnyProviderFn>();
  private readonly warned = new Set<string>();

  constructor(table: EventTable, reporters: RegistryReporters = {}) {
    this.table = table;
    this.warn = reporters.warn ?? ((message) => console.warn(message));
    this.report = reporters.onError ?? ((event, error) => console.error(event, error));
  }

  /** Subscribe to a notification event (many subscribers, no return) or
   * register a provider (single slot — a second registration throws). Returns
   * a dispose undoing the registration. Unknown event names throw. */
  hook<E extends keyof NMap & string>(
    event: E,
    fn: (ctx: NMap[E]) => void | Promise<void>,
  ): Dispose;
  hook<E extends keyof PMap & string>(event: E, fn: PMap[E]): Dispose;
  hook(event: string, fn: NotificationFn | AnyProviderFn): Dispose {
    const spec = this.spec(event);
    this.warnIfDeprecated(event, spec);
    if (spec.kind === 'provider') {
      if (this.providers.has(event)) {
        throw new Error(`a provider is already registered for "${event}"`);
      }
      const provider = fn as AnyProviderFn;
      this.providers.set(event, provider);
      return () => {
        if (this.providers.get(event) === provider) {
          this.providers.delete(event);
        }
      };
    }
    const list = this.subscribers.get(event) ?? [];
    const subscriber = fn as NotificationFn;
    list.push(subscriber);
    this.subscribers.set(event, list);
    return () => {
      const index = list.indexOf(subscriber);
      if (index >= 0) {
        list.splice(index, 1);
      }
    };
  }

  /** Fire a notification event: every subscriber runs in registration order,
   * awaited sequentially; a throw or rejection is reported via `onError` and
   * the remaining subscribers still run. */
  async emit<E extends keyof NMap & string>(event: E, ctx: NMap[E]): Promise<void> {
    const spec = this.spec(event);
    if (spec.kind !== 'notification') {
      throw new Error(`"${event}" is a provider event — resolve it, don't emit it`);
    }
    const list = [...(this.subscribers.get(event) ?? [])];
    for (const subscriber of list) {
      try {
        await subscriber(ctx as never);
      } catch (error) {
        this.report(event, error);
      }
    }
  }

  /** The registered provider for the event, or `null` when none is. */
  resolve<E extends keyof PMap & string>(event: E): PMap[E] | null {
    const spec = this.spec(event);
    if (spec.kind !== 'provider') {
      throw new Error(`"${event}" is a notification event — emit it, don't resolve it`);
    }
    return (this.providers.get(event) as PMap[E] | undefined) ?? null;
  }

  private spec(event: string): EventSpec {
    const spec = this.table.get(event);
    if (spec === undefined) {
      throw new Error(`unknown hook event "${event}"`);
    }
    return spec;
  }

  private warnIfDeprecated(event: string, spec: EventSpec): void {
    if (spec.status === 'active' || this.warned.has(event)) {
      return;
    }
    this.warned.add(event);
    const { since, replacement, removedIn } = spec.status.deprecated;
    this.warn(
      `hook event "${event}" is deprecated since ${since} and will be removed in ` +
        `${removedIn} — use "${replacement}" instead`,
    );
  }
}
