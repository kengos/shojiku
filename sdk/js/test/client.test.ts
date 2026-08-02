import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration, UsageError } from '../src/index.js';
import { makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('generate', () => {
  it('renders a template the root resolves and carries its page count', async () => {
    const result = await makeClient().generate('receipt', {
      customer: { name: 'Yamada Shoji K.K.' },
    });

    expect(result.success).toBe(true);
    expect(result.unwrap().bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.unwrap().pageCount).toBe(1);
    expect(result.unwrap().origin).toBe('rendered');
  });

  it('carries the engine’s warnings on a result that SUCCEEDED', async () => {
    const result = await makeClient().generate('warns', {});

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it('is a failed result, not a rejection, when the engine refuses the document', async () => {
    const result = await makeClient().generate('broken', {});

    expect(result.failed).toBe(true);
    expect(result.failure?.step).toBe('generate');
    expect(result.errors.map((item) => item.code)).toContain('image_source_missing');
  });

  it('passes a STRING params through verbatim, so the engine parses JSON or YAML', async () => {
    const yaml = await makeClient().generate('receipt', 'customer:\n  name: From YAML\n');
    const json = await makeClient().generate('receipt', '{"customer":{"name":"From YAML"}}');

    expect(yaml.success).toBe(true);
    expect(json.success).toBe(true);
    // Same data by two spellings the engine accepts: same document.
    expect(yaml.unwrap().bytes).toEqual(json.unwrap().bytes);
  });

  it('lets a per-call lang beat the client-wide one', async () => {
    const client = makeClient({ lang: 'en-US' });
    const clientWide = await client.generate('receipt', {});
    const perCall = await client.generate('receipt', {}, { lang: 'ja-JP' });

    expect(clientWide.success).toBe(true);
    expect(perCall.success).toBe(true);
    // The locale reaches the engine: a different locale lays the document out
    // differently enough to change the bytes.
    expect(perCall.unwrap().bytes).not.toEqual(clientWide.unwrap().bytes);
  });

  it('refuses a template name that is not a string as programmer misuse', async () => {
    const client = makeClient();

    // A number is a bug in the calling program, not a hostile request.
    await expect(client.generate(42 as unknown as string, {})).rejects.toBeInstanceOf(UsageError);
  });

  it('treats a BLANK name as a hostile string: a failed result, not a throw', async () => {
    // An empty string can arrive straight from a form field.
    const result = await makeClient().generate('', {});

    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('template_name');
  });

  it('says how to configure a template root when no client has one', async () => {
    const client = makeClient({ templates: null, env: false });

    await expect(client.generate('receipt', {})).rejects.toThrow(/no template root/);
  });

  it('serializes params through JSON and refuses what cannot cross', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(makeClient().generate('receipt', circular)).rejects.toBeInstanceOf(UsageError);
  });
});

describe('hostile params', () => {
  it('does not let a `__proto__` key in parsed params pollute anything', async () => {
    // A LITERAL JSON string, deliberately: an object literal `{ __proto__: … }`
    // in the test source sets the prototype and serializes to `{}`, so it
    // would exercise nothing. Parsed, the key is an ORDINARY own property.
    const params = JSON.parse('{"__proto__":{"polluted":true},"customer":{"name":"x"}}');
    const result = await makeClient().generate('receipt', params);

    expect(result.success).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('degrades an oversized params payload to a result, never a crash', async () => {
    // Whatever the engine decides about a megabyte of text, the binding must
    // hand it back as data rather than dying on the way through.
    const params = { customer: { name: 'x'.repeat(1_000_000) } };
    const result = await makeClient().generate('receipt', params);

    expect(typeof result.success).toBe('boolean');
    expect(result.diagnostics).toBeInstanceOf(Array);
  });
});

describe('engineInfo', () => {
  it('returns the engine payload UNMODELLED, as a plain object', async () => {
    const info = await makeClient().engineInfo();

    // A plain object on purpose: the payload is an append-only wire this SDK
    // does not model, so an added key needs no change in seven languages.
    expect(typeof info).toBe('object');
    expect(Array.isArray(info.capabilities)).toBe(true);
    expect(typeof info.version).toBe('string');
  });
});

describe('templateRoot', () => {
  it('is exposed so an application can report what it resolved against', () => {
    expect(makeClient().templateRoot?.path).toContain('fixtures/templates');
  });

  it('is null when nothing configured one', () => {
    expect(makeClient({ templates: null }).templateRoot).toBeNull();
  });
});
