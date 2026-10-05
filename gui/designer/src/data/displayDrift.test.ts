// The engine facts the display controls mirror, pinned to the engine's own
// sources so a change there reds here: the unit keys every pack declares, the
// decimal-places clamp, the alignment and bold spellings the template style
// accepts, and the display-variant entry's shape. (The currency suggestions are
// pinned beside their list, `panel/defaultsModel.test.ts`.)

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNIT_SUGGESTIONS } from './DisplayKeyFields';
import { MAX_PRECISION } from './displayRules';
import { BOLD, TEXT_ALIGNS } from './recommendedStyle';

const read = (path: string) => readFileSync(resolve(process.cwd(), '../..', path), 'utf8');

describe('the engine sources the display controls mirror', () => {
  it('suggests exactly the unit keys every shipped locale pack declares', () => {
    const dirs = ['engine/formatter/src/lang/builtin', 'packs/locale'];
    const packs = dirs.flatMap((dir) =>
      readdirSync(resolve(process.cwd(), '../..', dir))
        .filter((name) => /^[a-z]{2,3}-[a-z]{2}\.yml$/.test(name))
        .map((name) => read(`${dir}/${name}`)),
    );
    expect(packs.length).toBe(7);
    const keysOf = (pack: string): Set<string> => {
      const block = pack.split(/^units:\n/m)[1]?.split(/^\S/m)[0] ?? '';
      return new Set([...block.matchAll(/^ {2}([a-z][a-z0-9_-]*):$/gm)].map((m) => m[1]));
    };
    const sets = packs.map(keysOf);
    const everywhere = [...sets[0]].filter((key) => sets.every((set) => set.has(key)));
    expect(everywhere.length).toBeGreaterThan(0);
    expect([...UNIT_SUGGESTIONS]).toEqual(everywhere);
  });

  it('stops decimal places where the formatter clamps them, on a u32 wire', () => {
    expect(read('engine/formatter/src/format/number.rs')).toContain(
      `const MAX_PRECISION: u32 = ${MAX_PRECISION};`,
    );
    expect(read('engine/core/src/definitions/schema.rs')).toContain('pub precision: Option<u32>,');
  });

  it('writes the alignment and bold spellings the template style accepts', () => {
    const enums = read('engine/core/src/style/enums.rs');
    const variants = (name: string) => {
      const body = enums.split(`pub enum ${name} {`)[1]?.split('}')[0] ?? '';
      return [...body.matchAll(/^\s+([A-Z][A-Za-z]*),$/gm)].map((m) => m[1].toLowerCase());
    };
    expect(variants('TextAlign')).toEqual([...TEXT_ALIGNS]);
    expect(variants('FontWeight')).toContain(BOLD);
  });

  it('writes a display variant as the engine reads one: an id and an optional label', () => {
    const schema = read('engine/core/src/definitions/schema.rs');
    const body = schema.split('pub struct FormatVariant {')[1]?.split('}')[0] ?? '';
    expect(body).toContain('pub id: String,');
    expect(body).toContain('pub label: Option<String>,');
    expect(body.match(/pub \w+:/g)).toHaveLength(2);
    expect(schema).toContain('pub display_formats: Vec<FormatVariant>,');
  });
});
