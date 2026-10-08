// @vitest-environment node
//
// The drift guard for the ruby model's copies of the engine: the two caps it
// refuses past (an entry the engine would skip with a warning), the item struct
// that carries `ruby`/`rubySize`, and the length units the size field accepts.
// Same shape as `linkWire.test.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_RUBY_CHARS, MAX_RUBY_ENTRIES, RUBY_CAPABILITY, rubySizeOp } from './rubyModel';

const ENGINE = new URL('../../../../engine/', import.meta.url);

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, ENGINE)), 'utf8');
}

describe('the ruby wire the panel mirrors', () => {
  it('reads the same entry cap', () => {
    const match = /pub const MAX_RUBY_ENTRIES: usize = (\d+);/.exec(
      read('core/src/template/ruby.rs'),
    );
    expect(match, 'MAX_RUBY_ENTRIES moved').not.toBeNull();
    expect(Number(match?.[1])).toBe(MAX_RUBY_ENTRIES);
  });

  it('reads the same per-entry cap, counted in chars', () => {
    const source = read('core/src/ruby.rs');
    const match = /pub const MAX_RUBY_LEN: usize = (\d+);/.exec(source);
    expect(match, 'MAX_RUBY_LEN moved').not.toBeNull();
    expect(Number(match?.[1])).toBe(MAX_RUBY_CHARS);
    expect(read('core/src/validate/ruby.rs')).toContain('s.chars().count() > MAX_RUBY_LEN');
  });

  it('finds both keys on the text item struct, and the capability that gates them', () => {
    const items = read('core/src/template/items.rs');
    const text = items.slice(items.indexOf('pub struct TextItem'));
    const body = text.slice(0, text.indexOf('\n}\n'));
    expect(body).toContain('pub ruby: Vec<RubyPair>');
    expect(body).toContain('#[serde(rename = "rubySize"');
    expect(read('authoring/src/capabilities/list/items.rs')).toContain(`"${RUBY_CAPABILITY}",`);
  });

  it('accepts every unit the engine parses except the percentage', () => {
    // The error message lists the grammar: "`%`/`pt`/`mm`/`cm`/`in`/`em`/`rem`".
    const match = /a \\\s*`([^"]+)` suffixed string/.exec(read('core/src/length.rs'));
    expect(match, 'the length grammar message moved').not.toBeNull();
    const units = (match?.[1] ?? '').split('`/`');
    expect(units.length).toBeGreaterThan(1);
    const view = { state: 'absent', rows: [], size: '', sizeUnreadable: false } as const;
    for (const unit of units) {
      const op = rubySizeOp('p', view, `2${unit}`);
      expect(op === null, unit).toBe(unit === '%');
    }
  });
});
