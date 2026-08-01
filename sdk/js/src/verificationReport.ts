/**
 * What verification found — INCLUDING what it did not look at.
 *
 * `notChecked` is a field, not a footnote, and this binding passes it through
 * untouched. A "valid" verdict that quietly skipped revocation is worse than no
 * verifier at all: it turns a missing capability into a false assurance, which
 * is exactly the trust a signing feature sells. Dropping it on the way through
 * an SDK would be the same lie one layer up.
 *
 * The four checks stay separate for the same reason. "The signature is valid
 * but covers only part of the file" is a different fact from "the signature is
 * wrong", and a caller that cannot tell them apart cannot explain the answer to
 * anyone.
 */

/** The outcome of one check: passed, or failed with the reason. */
export class Check {
  readonly status: string | null;
  readonly reason: string | null;

  constructor(item: unknown) {
    const payload = asRecord(item);
    this.status = typeof payload.status === 'string' ? payload.status : null;
    this.reason = typeof payload.reason === 'string' ? payload.reason : null;
  }

  /** A PARTICIPLE stands alone — the predicate rule the six mirror. */
  get passed(): boolean {
    return this.status === 'passed';
  }

  toString(): string {
    return this.reason ? `${this.status}: ${this.reason}` : String(this.status);
  }
}

/** The four checks, the verdict, and the list of what was never looked at. */
export class VerificationReport {
  readonly signature: Check;
  readonly coverage: Check;
  readonly certificateValidity: Check;
  readonly trustChain: Check;
  readonly notChecked: readonly string[];
  private readonly validFlag: unknown;

  constructor(payload: Record<string, unknown>) {
    this.validFlag = payload.valid;
    this.signature = new Check(payload.signature);
    this.coverage = new Check(payload.coverage);
    this.certificateValidity = new Check(payload.certificateValidity);
    this.trustChain = new Check(payload.trustChain);
    this.notChecked = Array.isArray(payload.notChecked)
      ? payload.notChecked.map((entry) => String(entry))
      : [];
  }

  static parse(payload: string): VerificationReport {
    return new VerificationReport(asRecord(JSON.parse(payload)));
  }

  /**
   * Whether every check this release PERFORMS passed.
   *
   * Read `notChecked` beside it: this is not "the document is trustworthy", it
   * is "nothing we looked at was wrong".
   */
  get valid(): boolean {
    return this.validFlag === true;
  }

  /** The four checks by name. A Map, so a wire key can never reach a prototype. */
  get checks(): Map<string, Check> {
    return new Map([
      ['signature', this.signature],
      ['coverage', this.coverage],
      ['certificateValidity', this.certificateValidity],
      ['trustChain', this.trustChain],
    ]);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
