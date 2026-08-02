/**
 * Why a lifecycle operation did not produce what was asked for.
 *
 * A VALUE, not an exception. The shape takes effect-ts's `Cause` as its
 * conceptual reference: which step failed, what class of thing went wrong, and
 * — when one failure happened because of another — the chain underneath it, all
 * inspectable rather than unwound. No effect framework is involved; only the
 * idea that a failure is data.
 */

import type { Diagnostic } from './diagnostic.js';

/**
 * The SDK's own lifecycle vocabulary.
 *
 * Always one of these three. The engine's error object carries a step of its
 * own naming an INTERNAL stage (`render`, `validate`), and passing that through
 * would make the trace's step mean different things depending on which layer
 * refused. What the engine said specifically is the `kind`.
 */
export const Step = {
  GENERATE: 'generate',
  SIGN: 'sign',
  VERIFY: 'verify',
} as const;

export type Step = (typeof Step)[keyof typeof Step];

/** What one failure was built from. */
export interface FailureInit {
  step: Step;
  kind: string;
  message: string;
  diagnostics?: Diagnostic[];
  cause?: Failure | null;
}

/** One failed lifecycle step, and the chain of causes under it. */
export class Failure {
  readonly step: Step;
  /**
   * A stable machine-readable class. Engine-side kinds come straight off the
   * wire; host-side ones are this package's own (`template_name`, `io`).
   */
  readonly kind: string;
  readonly message: string;
  readonly diagnostics: Diagnostic[];
  readonly cause: Failure | null;

  constructor({ step, kind, message, diagnostics, cause }: FailureInit) {
    this.step = step;
    this.kind = kind;
    this.message = message;
    this.diagnostics = diagnostics ?? [];
    this.cause = cause ?? null;
  }

  static fromErrorJson(
    payload: string | null,
    step: Step,
    diagnostics?: Diagnostic[],
    cause?: Failure | null,
  ): Failure {
    const parsed: Record<string, unknown> = payload ? JSON.parse(payload) : {};
    return new Failure({
      step,
      kind: typeof parsed.kind === 'string' ? parsed.kind : 'unknown',
      message: typeof parsed.message === 'string' ? parsed.message : '',
      diagnostics,
      cause,
    });
  }

  /**
   * This failure and everything under it, outermost first.
   *
   * What you log when you want the whole story rather than only its headline.
   */
  get causes(): Failure[] {
    return [this, ...(this.cause ? this.cause.causes : [])];
  }

  toString(): string {
    return `${this.step}/${this.kind}: ${this.message}`;
  }
}
