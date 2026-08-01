/**
 * The two-level split, mapped.
 *
 * A non-zero status is the CALLER's mistake and throws; status zero with
 * `success` false is an ordinary fact about a document and becomes a failed
 * result. This suite builds `Snapshot` VALUES for the cases the addon cannot
 * be made to produce on demand — verification emits no diagnostics today, and
 * the binding must still carry them if it ever does.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration, UsageError } from '../src/index.js';
import type { Snapshot } from '../src/library.js';
import { document, guard, verdict } from '../src/outcome.js';
import { makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    status: 0,
    success: true,
    pdf: Buffer.alloc(0),
    json: '',
    diagnostics: '',
    error: '',
    ...overrides,
  };
}

describe('guard', () => {
  it('lets the ordinary level through', () => {
    expect(() => guard(snapshot())).not.toThrow();
    expect(() => guard(snapshot({ success: false }))).not.toThrow();
  });

  it('throws for a non-zero status, naming it', () => {
    try {
      guard(snapshot({ status: 3, error: '{"kind":"invalid_request"}' }));
      expect.unreachable('a non-zero status is programmer misuse');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as Error).message).toContain('status 3');
    }
  });
});

describe('document', () => {
  it('attaches diagnostics to a SUCCESS', async () => {
    const client = makeClient();
    const result = document(
      snapshot({
        pdf: Buffer.from('%PDF-'),
        json: '{"pageCount":2}',
        diagnostics: '{"items":[{"severity":"warning","code":"box_overflow"}]}',
      }),
      'generate',
      client,
      'rendered',
    );

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.unwrap().pageCount).toBe(2);
  });

  it('reports no page count when the payload has none, or has a non-number', () => {
    const client = makeClient();

    expect(document(snapshot(), 'sign', client, 'rendered').unwrap().pageCount).toBeNull();
    expect(
      document(snapshot({ json: '{"pageCount":null}' }), 'sign', client, 'rendered').unwrap()
        .pageCount,
    ).toBeNull();
  });

  it('is a failed result carrying the engine’s diagnostics', () => {
    const result = document(
      snapshot({
        success: false,
        error: '{"kind":"validate","message":"refused"}',
        diagnostics: '{"items":[{"severity":"error","code":"image_source_missing"}]}',
      }),
      'generate',
      makeClient(),
      'rendered',
    );

    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('validate');
    expect(result.errors).toHaveLength(1);
  });
});

describe('verdict', () => {
  it('carries a report and diagnostics on a PASSING verdict', () => {
    const result = verdict(
      snapshot({
        json: '{"valid":true,"notChecked":["revocation"]}',
        diagnostics: '{"items":[{"severity":"warning","code":"x"}]}',
      }),
    );

    expect(result.success).toBe(true);
    expect(result.report?.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it('carries the report on a FAILING verdict too', () => {
    const result = verdict(
      snapshot({
        success: false,
        json: '{"valid":false,"notChecked":["revocation"]}',
        error: '{"kind":"signature","message":"does not verify"}',
      }),
    );

    expect(result.failed).toBe(true);
    expect(result.report?.notChecked).toEqual(['revocation']);
    expect(result.failure?.step).toBe('verify');
  });

  it('has NO report when the payload was empty', () => {
    // A different fact from an empty report.
    expect(verdict(snapshot()).report).toBeNull();
  });
});
