/**
 * The optional host-side log channel.
 *
 * Silent unless an application supplies a logger, and deliberately narrow: it
 * reports what the BINDING did — which addon it loaded, which ABI revision it
 * found, which lifecycle step ran and for how long — and never what the
 * document contained. Params, rendered bytes, diagnostics and key material are
 * all outside this channel BY RULE, because a log line is the easiest way for a
 * secret to leave a process, and because a diagnostic belongs to the result the
 * caller already has.
 *
 * What does cross is bounded first, so a hostile template name cannot smuggle
 * control characters into a log file.
 *
 * Any object with a `debug` method is accepted — `console`, a framework's own
 * logger, or an application's — so this package's runtime dependency list stays
 * at exactly zero entries. The cross-language rule the other six mirror: each
 * SDK accepts its ecosystem's standard logger interface, optionally.
 */

import type { Result } from './result.js';

/** Anything that can be told something at debug level. */
export interface Logger {
  debug(message: string): unknown;
}

/** One host event's fields. Scalars only — nothing document-shaped fits. */
export type Fields = Record<string, string | number | boolean>;

/** Host events, or silence. */
export class Log {
  private readonly logger: Logger | null;

  constructor(logger: Logger | null = null) {
    this.logger = logger;
  }

  /**
   * Record one host event.
   *
   * The message is built only when someone is listening: a silent log costs a
   * null check, not string formatting.
   */
  event(name: string, fields: Fields = {}): void {
    if (this.logger === null) {
      return;
    }

    this.logger.debug(`shojiku ${name}${render(fields)}`);
  }

  /**
   * Time one lifecycle operation and return what it returned.
   *
   * The operation is expected to produce a result, whose verdict is recorded as
   * `ok` — the one thing worth knowing about an operation that is not its
   * content.
   */
  async timed<T>(
    name: string,
    operation: () => Promise<Result<T>>,
    fields: Fields = {},
  ): Promise<Result<T>> {
    const started = performance.now();
    const result = await operation();
    const ms = Math.round((performance.now() - started) * 10) / 10;
    this.event(name, { ...fields, ms, ok: result.success });
    return result;
  }
}

function render(fields: Fields): string {
  return Object.entries(fields)
    .map(([key, value]) => ` ${key}=${value}`)
    .join('');
}
