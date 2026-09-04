// @vitest-environment node
//
// The drift guard for `NO_BOX_WIRE_TYPES`: it must be exactly the `Item`
// variants whose struct omits `box_`, DERIVED from the engine source rather
// than restated here. A literal-vs-literal assertion would have let the engine
// grow a sixteenth boxless variant — or give `repeat` a box — with this gate
// still green, and a set that drifts from the wire is precisely how the defect
// this guard exists for (a placement tab authoring a parse-error key) comes
// back. Same shape as `borderTypes.test.ts`, which pins the border keywords to
// `style/border.rs`.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NO_BOX_WIRE_TYPES } from './itemView';

const ENGINE = new URL('../../../../engine/core/src/', import.meta.url);

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, ENGINE)), 'utf8');
}

/** Every non-test module under `template/`, plus `template.rs` itself. Read as
 * a DIRECTORY rather than a hand-written list: a list is the same brittleness
 * this guard exists to remove, and the first draft of it was already missing
 * `repeat_flow.rs` — which the guard caught by throwing rather than by
 * quietly reporting the struct boxless. */
function templateSources(): string[] {
  const dir = fileURLToPath(new URL('template/', ENGINE));
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === 'tests'
          ? []
          : walk(`${at}${entry.name}/`)
        : entry.name.endsWith('.rs')
          ? [readFileSync(`${at}${entry.name}`, 'utf8')]
          : [],
    );
  return [read('template.rs'), ...walk(dir)];
}

/** `Item`'s variants, as (Rust variant, wire `type:` spelling) pairs. The enum
 * is `rename_all = "snake_case"`, so the wire name is derived, not listed. */
function itemVariants(): { rust: string; wire: string }[] {
  const src = read('template.rs');
  const body = /pub enum Item \{\n([\s\S]*?)\n\}/.exec(src);
  if (body === null) {
    throw new Error('could not find `pub enum Item` in template.rs');
  }
  return [...body[1].matchAll(/^ {4}(\w+)\((?:Box<)?(\w+)/gm)].map((m) => ({
    rust: m[2],
    wire: m[1].replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase(),
  }));
}

/** Whether the struct named `name` declares a `box` field, searched across the
 * template modules that define the item structs. */
function declaresBox(name: string, sources: readonly string[]): boolean {
  for (const src of sources) {
    const found = new RegExp(`pub struct ${name} \\{\\n([\\s\\S]*?)\\n\\}`).exec(src);
    if (found !== null) {
      return /\bbox_\s*:/.test(found[1]);
    }
  }
  throw new Error(`no \`pub struct ${name}\` found in the template modules`);
}

describe('NO_BOX_WIRE_TYPES stays pinned to the engine wire', () => {
  it('is exactly the `Item` variants whose struct omits `box_`', () => {
    const variants = itemVariants();
    // A regex that silently stopped matching would compare against an empty
    // list and pass; pin the population first (the border guard's control).
    expect(variants.length).toBe(15);

    const sources = templateSources();
    // The other control: at least one variant must come back WITH a box, or
    // `declaresBox` returning false for everything would look like agreement.
    const boxed = variants.filter((v) => declaresBox(v.rust, sources));
    expect(boxed.length).toBeGreaterThan(0);

    const boxless = variants.filter((v) => !declaresBox(v.rust, sources)).map((v) => v.wire);
    expect([...NO_BOX_WIRE_TYPES].sort()).toEqual([...boxless].sort());
  });
});
