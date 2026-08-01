/**
 * One thing the engine noticed about a document.
 *
 * Passed through, never interpreted. `code` and `args` are the engine's frozen
 * contract — a translating consumer renders its own message from them — so this
 * class parses the wire and stops. It does not translate, it does not
 * re-classify, and it never becomes an exception: a render that warns still
 * succeeded, and a render that failed says why in these.
 */

/** One engine diagnostic, exactly as the engine stated it. */
export class Diagnostic {
  readonly severity: string | null;
  readonly code: string | null;
  readonly category: string | null;
  readonly message: string | null;
  readonly path: string | null;
  readonly args: Record<string, unknown>;
  readonly origin: string | null;

  constructor(item: Record<string, unknown>) {
    this.severity = text(item.severity);
    this.code = text(item.code);
    this.category = text(item.category);
    this.message = text(item.message);
    this.path = text(item.path);
    this.args = record(item.args);
    this.origin = text(item.origin);
  }

  /** Every diagnostic in a payload, or nothing at all for an empty one. */
  static parse(payload: string): Diagnostic[] {
    if (!payload) {
      return [];
    }

    const items = record(JSON.parse(payload)).items;
    return Array.isArray(items) ? items.map((item) => new Diagnostic(record(item))) : [];
  }

  /** A NOUN takes `is`, so this does not read as "the error object". */
  get isError(): boolean {
    return this.severity === 'error';
  }

  get isWarning(): boolean {
    return this.severity === 'warning';
  }

  toString(): string {
    return [this.path, this.message].filter((part) => part !== null).join(': ');
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * A parsed payload as a plain map.
 *
 * `Object.create(null)`-free on purpose: what matters is that a `__proto__` key
 * arriving from `JSON.parse` is an ORDINARY own property (the parser never runs
 * the setter), and that every lookup this package makes against attacker text
 * goes through a `Map` rather than through an object it could inherit from.
 */
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
