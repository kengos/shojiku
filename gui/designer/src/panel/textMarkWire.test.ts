// @vitest-environment node
//
// The drift guard for the text circle model's copies of the engine: the four
// fields `TextMark` carries (no op may write a fifth — the struct is
// `deny_unknown_fields`), the item that carries it and the capability that gates
// it, the default clearance the panel names, the font-size basis the clearance
// resolves against, the bound past which it draws the default instead, and the
// unit list `parse_length_text` reports in its error message. Same shape as
// `rubyWire.test.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARK_PADDING,
  MAX_PADDING_PT,
  markPaddingOp,
  readTextMark,
  TEXT_MARK_CAPABILITY,
} from './textMarkModel';

const ENGINE = new URL('../../../../engine/', import.meta.url);

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, ENGINE)), 'utf8');
}

function struct(source: string, name: string): string {
  const from = source.slice(source.indexOf(`pub struct ${name}`));
  return from.slice(0, from.indexOf('\n}\n'));
}

describe('the text circle wire the panel mirrors', () => {
  it('finds `mark` on the text item only, and the capability that gates it', () => {
    const items = read('core/src/template/items.rs');
    expect(struct(items, 'TextItem')).toContain('pub mark: Option<Box<TextMark>>');
    expect(items.match(/pub mark: /g)).toHaveLength(1);
    expect(read('authoring/src/capabilities/list/items.rs')).toContain(
      `"${TEXT_MARK_CAPABILITY}",`,
    );
  });

  it('reads the four fields the circle carries, every one optional', () => {
    const source = read('core/src/template/marks.rs');
    const body = struct(source, 'TextMark');
    // Any fifth key is a parse error, not an ignored one.
    const head = source.slice(0, source.indexOf('pub struct TextMark'));
    expect(head.slice(head.lastIndexOf('#[derive'))).toContain('#[serde(deny_unknown_fields)]');
    const fields = [...body.matchAll(/pub (\w+): (.+),/g)].map((m) => [m[1], m[2]]);
    expect(fields).toEqual([
      ['data', 'Option<MarkBinding>'],
      ['padding', 'Option<Length>'],
      ['style_names', 'Vec<String>'],
      ['style', 'Style'],
    ]);
    expect(body).toContain('#[serde(rename = "styleNames"');
  });

  it('names the same default clearance, resolved against the font size', () => {
    const source = read('layout/src/engine/text/mark.rs');
    const match = /const DEFAULT_PAD_EM: f64 = ([\d.]+);/.exec(source);
    expect(match, 'DEFAULT_PAD_EM moved').not.toBeNull();
    expect(`${match?.[1]}em`).toBe(DEFAULT_MARK_PADDING);
    // `%`, `em` and `rem` all resolve against the text's own size here, so a
    // percentage is safe to offer (unlike `rubySize`, which takes the parent width).
    expect(source).toMatch(/len\.resolve\(\s*size,\s*FontRel \{\s*em: size,\s*rem: size,/);
  });

  it('bounds an absolute clearance where the engine stops drawing it', () => {
    const match = /pub const MAX_RESOLVED_PT: f64 = ([\d_]+)\.0;/.exec(
      read('layout-box/src/resolve.rs'),
    );
    expect(match, 'MAX_RESOLVED_PT moved').not.toBeNull();
    expect(Number(match?.[1].replaceAll('_', ''))).toBe(MAX_PADDING_PT);
    expect(read('layout/src/engine/text/mark.rs')).toContain('pt.abs() <= MAX_RESOLVED_PT');
  });

  it('accepts every unit the engine reports in its length grammar', () => {
    const match = /a \\\s*`([^"]+)` suffixed string/.exec(read('core/src/length.rs'));
    expect(match, 'the length grammar message moved').not.toBeNull();
    const units = (match?.[1] ?? '').split('`/`');
    expect(units.length).toBeGreaterThan(1);
    const read0 = (p: string) => (p === 'p' ? { mark: {} } : p === 'p.mark' ? {} : undefined);
    const view = readTextMark(read0, 'p');
    for (const unit of units) {
      expect(markPaddingOp(view, `2${unit}`), unit).not.toBeNull();
    }
  });
});
