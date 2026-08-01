import { afterEach, describe, expect, it } from 'vitest';
import { Diagnostic, Failure, Result, resetConfiguration, UnwrapError } from '../src/index.js';
import { makeClient, rendered } from './support/fixtures.js';

afterEach(resetConfiguration);

function warning(): Diagnostic {
  return new Diagnostic({ severity: 'warning', code: 'box_overflow', message: 'too small' });
}

function error(): Diagnostic {
  return new Diagnostic({ severity: 'error', code: 'image_source_missing', message: 'no src' });
}

describe('Result', () => {
  it('is a success with the value under both aliases', async () => {
    const artifact = await rendered();
    const result = Result.succeeded(artifact, []);

    expect(result.success).toBe(true);
    expect(result.failed).toBe(false);
    // Both aliases are the same object; they exist so calling code reads as
    // what it is doing.
    expect(result.artifact).toBe(artifact);
    expect(result.report).toBe(artifact);
    expect(result.value).toBe(artifact);
  });

  it('is a failure carrying the trace and the failure’s own diagnostics', () => {
    const failure = new Failure({
      step: 'generate',
      kind: 'template_name',
      message: 'nope',
      diagnostics: [error()],
    });
    const result = Result.fromFailure(failure);

    expect(result.failed).toBe(true);
    expect(result.failure).toBe(failure);
    expect(result.diagnostics).toEqual([error()]);
  });

  it('slices diagnostics by severity, on a SUCCESS too', () => {
    const result = Result.succeeded('x', [warning(), error(), warning()]);

    expect(result.warnings).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });

  it('unwraps a success', () => {
    expect(Result.succeeded('x', []).unwrap()).toBe('x');
  });

  it('throws UnwrapError on a failure, carrying the failure', () => {
    const failure = new Failure({ step: 'sign', kind: 'key', message: 'bad key' });

    try {
      Result.fromFailure(failure).unwrap();
      expect.unreachable('unwrapping a failed result is programmer misuse');
    } catch (caught) {
      expect(caught).toBeInstanceOf(UnwrapError);
      expect((caught as UnwrapError).failure).toBe(failure);
    }
  });

  it('does NOT throw from the aliases — they are the non-throwing form', () => {
    const result = Result.fromFailure(new Failure({ step: 'sign', kind: 'k', message: 'm' }));

    expect(result.artifact).toBeNull();
    expect(result.report).toBeNull();
  });

  it('unwraps a value-less success without blowing up', () => {
    // A verify whose payload was empty succeeds with no report.
    expect(new Result<string>(null, []).unwrap()).toBeNull();
  });

  it('is what a real lifecycle call resolves to', async () => {
    const result = await makeClient().generate('receipt', { customer: { name: 'x' } });

    expect(result).toBeInstanceOf(Result);
    expect(result.success).toBe(true);
  });
});
