import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { inferDefinitions } from './inferStub';

describe('inferDefinitions', () => {
  it('emits an engine-shaped stub with types inferred per JSON type', () => {
    const yaml = inferDefinitions(
      JSON.stringify({ name: 'Bob', age: 30, active: true, tags: ['a'], addr: { city: 'X' } }),
    );
    const schema = readTemplate(parseTemplate(yaml)) as Record<string, unknown>;
    expect(schema.version).toBe('0.2.0');
    expect(schema.type).toBe('object');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.name.type).toBe('string');
    expect(props.age.type).toBe('number');
    expect(props.active.type).toBe('boolean');
    expect(props.tags.type).toBe('array');
    expect(props.addr.type).toBe('object');
  });

  it('sets example to the current value per leaf', () => {
    const yaml = inferDefinitions(JSON.stringify({ name: 'Bob', age: 30 }));
    const props = (
      readTemplate(parseTemplate(yaml)) as { properties: Record<string, Record<string, unknown>> }
    ).properties;
    expect(props.name.example).toBe('Bob');
    expect(props.age.example).toBe(30);
  });

  it('infers array item schema from the first row (and defaults an empty array)', () => {
    const yaml = inferDefinitions(JSON.stringify({ rows: [{ n: 1 }], empty: [] }));
    const props = (
      readTemplate(parseTemplate(yaml)) as { properties: Record<string, Record<string, unknown>> }
    ).properties;
    expect((props.rows.items as Record<string, unknown>).type).toBe('object');
    expect((props.empty.items as Record<string, unknown>).type).toBe('string');
  });

  it('round-trips hostile key names as quoted scalars', () => {
    const hostile = { 'a: b\n#c': 1, '&anchor *alias': 'x', '"q"': true };
    const yaml = inferDefinitions(JSON.stringify(hostile));
    const props = (readTemplate(parseTemplate(yaml)) as { properties: Record<string, unknown> })
      .properties;
    expect(Object.keys(props).sort()).toEqual(['"q"', '&anchor *alias', 'a: b\n#c'].sort());
  });

  it('treats a null leaf and other JSON as a plain string schema', () => {
    const yaml = inferDefinitions(JSON.stringify({ nothing: null }));
    const props = (
      readTemplate(parseTemplate(yaml)) as { properties: Record<string, Record<string, unknown>> }
    ).properties;
    expect(props.nothing.type).toBe('string');
    expect('example' in props.nothing).toBe(false);
  });

  it('produces a minimal empty-properties stub for invalid params', () => {
    const schema = readTemplate(parseTemplate(inferDefinitions('nope'))) as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.properties).toEqual({});
  });

  it('caps inference depth on pathologically nested data', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 40; i += 1) {
      deep = { a: deep };
    }
    expect(() => inferDefinitions(JSON.stringify({ root: deep }))).not.toThrow();
  });
});
