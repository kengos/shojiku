/**
 * What every lifecycle operation resolves to.
 *
 * Nothing in the normal flow rejects. A template that will not render, a key
 * that will not sign, a signature that does not verify are all data you query —
 * `success`, the value, the engine's diagnostics either way, and on failure the
 * `Failure` trace.
 *
 * Diagnostics ride on a SUCCESS too. A render that worked can still have warned
 * about an overflowing box, and a caller that only looks at failures never sees
 * them.
 */

import type { Diagnostic } from './diagnostic.js';
import { UnwrapError } from './errors.js';
import type { Failure } from './failure.js';

/** A lifecycle operation's outcome: a value, diagnostics, maybe a failure. */
export class Result<T> {
  readonly value: T | null;
  readonly diagnostics: Diagnostic[];
  readonly failure: Failure | null;

  constructor(
    value: T | null = null,
    diagnostics: Diagnostic[] = [],
    failure: Failure | null = null,
  ) {
    this.value = value;
    this.diagnostics = diagnostics;
    this.failure = failure;
  }

  static succeeded<T>(value: T, diagnostics: Diagnostic[]): Result<T> {
    return new Result<T>(value, diagnostics);
  }

  static fromFailure<T>(failure: Failure): Result<T> {
    return new Result<T>(null, failure.diagnostics, failure);
  }

  /** An ADJECTIVE stands alone — the predicate rule the six mirror. */
  get success(): boolean {
    return this.failure === null;
  }

  get failed(): boolean {
    return !this.success;
  }

  /**
   * The value under the name of what the operation produced. Both aliases are
   * the same object; they exist so calling code reads as what it is doing.
   */
  get artifact(): T | null {
    return this.value;
  }

  get report(): T | null {
    return this.value;
  }

  /**
   * The value, or a thrown `UnwrapError`.
   *
   * The opt-in bridge for a script that wants a stack trace rather than a
   * branch, and the ONE place this API throws for something other than a
   * misused argument. That is why the ruling is stated rather than implied, and
   * frozen for every Shojiku SDK: **calling unwrap on a failed result is
   * programmer misuse** — a caller who has not checked `success` is asserting
   * the operation worked. Application code that handles failure keeps using
   * `success` and `failure`; nothing in this package calls it.
   *
   * (JavaScript has no `!` suffix, so the reference's `artifact!`/`report!`
   * pair is spelled as this one method, exactly as the python mirror spells it;
   * `artifact` and `report` remain the non-throwing aliases.)
   */
  unwrap(): T {
    if (this.failure !== null) {
      throw new UnwrapError(this.failure);
    }

    // Cast rather than assert: a verify whose payload was empty succeeds with
    // no report, so a value-less success is reachable and must not blow up.
    return this.value as T;
  }

  /** Only the diagnostics that are errors — the ones that explain a refusal. */
  get errors(): Diagnostic[] {
    return this.diagnostics.filter((item) => item.isError);
  }

  /** Only the warnings, which a SUCCESSFUL result can carry. */
  get warnings(): Diagnostic[] {
    return this.diagnostics.filter((item) => item.isWarning);
  }
}
