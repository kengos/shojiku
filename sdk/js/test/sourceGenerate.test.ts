/**
 * The bytes-first entrance: sources the application already holds.
 *
 * What it must never do is read a file. A path-shaped template argument is a
 * template that fails to parse — an SDK that helpfully opened it would make
 * every containment rule bypassable by spelling the same thing differently.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration } from '../src/index.js';
import {
  FIXTURE_TEMPLATES,
  makeClient,
  SOURCE_ASSETS,
  sourceTemplate,
  textItem,
} from './support/fixtures.js';

afterEach(resetConfiguration);

describe('generateSource', () => {
  it('renders template TEXT the caller supplies, with no root involved', async () => {
    const client = makeClient({ templates: null });
    const result = await client.generateSource({
      template: sourceTemplate(textItem('customer.name')),
      params: { customer: { name: 'From bytes' } },
    });

    expect(result.success).toBe(true);
    expect(result.unwrap().bytes.subarray(0, 5).toString()).toBe('%PDF-');
    // A different origin from a rendered document, which is what a strict
    // client acts on.
    expect(result.unwrap().origin).toBe('source');
  });

  it('resolves bundled assets against the assetsDir the CALL supplies', async () => {
    const result = await makeClient().generateSource({
      template: sourceTemplate(
        [
          '- id: logo',
          '  type: image',
          '  box: { x: 0, y: 0, w: 40, h: 40 }',
          '  src: assets/logo.svg',
        ].join('\n'),
      ),
      assetsDir: SOURCE_ASSETS,
      params: {},
    });

    expect(result.success).toBe(true);
  });

  it('takes definitions as text too', async () => {
    const result = await makeClient({ templates: null }).generateSource({
      template: sourceTemplate(textItem('customer.name')),
      definitions: [
        'version: 0.2.0',
        'type: object',
        'properties:',
        '  customer:',
        '    type: object',
        '    properties:',
        '      name: { type: string }',
      ].join('\n'),
      params: { customer: { name: 'Declared' } },
    });

    expect(result.success).toBe(true);
  });

  it('does NOT open a path-shaped template — it parses it as source and fails', async () => {
    const path = `${FIXTURE_TEMPLATES}/receipt/templates.yml`;
    const result = await makeClient().generateSource({ template: path, params: {} });

    // The refusal must be a PARSE failure. If this SDK had opened the file, the
    // render would have succeeded — which is the bypass this test exists for.
    expect(result.failed).toBe(true);
    expect(result.unwrap.bind(result)).toThrow();
    expect(result.failure?.step).toBe('generate');
  });

  it('renders with no params at all — a template that binds nothing', async () => {
    const result = await makeClient({ templates: null }).generateSource({
      template: sourceTemplate(
        [
          '- id: line',
          '  type: text',
          '  box: { x: 0, y: 0, w: 400, h: 16 }',
          '  text: Static',
        ].join('\n'),
      ),
    });

    expect(result.success).toBe(true);
  });

  it('honours a per-call lang here too', async () => {
    const result = await makeClient({ templates: null }).generateSource({
      template: sourceTemplate(textItem('customer.name')),
      params: { customer: { name: 'x' } },
      lang: 'ja-JP',
    });

    expect(result.success).toBe(true);
  });
});
