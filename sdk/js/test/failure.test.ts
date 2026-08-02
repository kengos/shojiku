import { afterEach, describe, expect, it } from 'vitest';
import { Diagnostic, Failure, resetConfiguration, Step } from '../src/index.js';
import { makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('Failure', () => {
  it('parses the engine’s error object', () => {
    const failure = Failure.fromErrorJson(
      JSON.stringify({ step: 'render', kind: 'font_pack', message: 'no such pack' }),
      Step.GENERATE,
    );

    // The step is the SDK's OWN lifecycle step, never the engine's internal
    // one — the engine said `render`, and this SDK's vocabulary says
    // `generate`. What the engine said specifically is the `kind`.
    expect(failure.step).toBe('generate');
    expect(failure.kind).toBe('font_pack');
    expect(failure.message).toBe('no such pack');
  });

  it('falls back to a named unknown rather than to undefined', () => {
    const failure = Failure.fromErrorJson('{}', Step.SIGN);

    expect(failure.kind).toBe('unknown');
    expect(failure.message).toBe('');
  });

  it('copes with an absent payload', () => {
    expect(Failure.fromErrorJson(null, Step.VERIFY).kind).toBe('unknown');
  });

  it('ignores non-string fields on the wire', () => {
    const failure = Failure.fromErrorJson('{"kind":7,"message":[]}', Step.SIGN);

    expect(failure.kind).toBe('unknown');
    expect(failure.message).toBe('');
  });

  it('flattens its cause chain outermost first', () => {
    const inner = new Failure({ step: Step.GENERATE, kind: 'io', message: 'ENOENT' });
    const outer = new Failure({
      step: Step.GENERATE,
      kind: 'template_not_found',
      message: 'no template by that name',
      cause: inner,
    });

    expect(outer.causes).toEqual([outer, inner]);
    expect(inner.causes).toEqual([inner]);
    expect(outer.cause).toBe(inner);
  });

  it('carries diagnostics and defaults them to none', () => {
    const withNone = new Failure({ step: Step.SIGN, kind: 'k', message: 'm' });
    const withSome = new Failure({
      step: Step.SIGN,
      kind: 'k',
      message: 'm',
      diagnostics: [new Diagnostic({ code: 'x' })],
    });

    expect(withNone.diagnostics).toEqual([]);
    expect(withSome.diagnostics).toHaveLength(1);
  });

  it('prints as step/kind: message', () => {
    expect(String(new Failure({ step: Step.VERIFY, kind: 'coverage', message: 'gap' }))).toBe(
      'verify/coverage: gap',
    );
  });

  it('names the SDK step on a real refusal, whatever the engine called it', async () => {
    const result = await makeClient().generate('broken', {});

    expect(result.failure?.step).toBe('generate');
    expect(Object.values(Step)).toContain(result.failure?.step);
  });
});
