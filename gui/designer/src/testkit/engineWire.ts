// Reads the engine's template STRUCTS off disk, for the drift guards that pin a
// panel type set to the wire it authors (`panel/noBoxWire`, `panel/styleNamesWire`).
// A literal-vs-literal assertion would let the engine grow or drop a key with the
// guard still green; these read the Rust source instead, so the set a panel
// gates on is DERIVED from the struct that parses what it writes.
//
// Suite substrate, not product code (coverage-excluded like the rest of
// `testkit/`). Node env only; every consumer carries the
// `@vitest-environment node` docblock.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENGINE = new URL('../../../../engine/core/src/', import.meta.url);

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, ENGINE)), 'utf8');
}

/** Every non-test module under `template/`, plus `template.rs` itself. Read as
 * a DIRECTORY rather than a hand-written list: a list is the same brittleness
 * this guard exists to remove, and the first draft of it was already missing
 * `repeat_flow.rs` — which the guard caught by throwing rather than by
 * quietly reporting the struct boxless. */
export function templateSources(): string[] {
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
export function itemVariants(): { rust: string; wire: string }[] {
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

/** The body of the struct named `name`, searched across the template modules
 * that define the item structs. */
export function structBody(name: string, sources: readonly string[]): string {
  for (const src of sources) {
    const found = new RegExp(`pub struct ${name} \\{\\n([\\s\\S]*?)\\n\\}`).exec(src);
    if (found !== null) {
      return found[1];
    }
  }
  throw new Error(`no \`pub struct ${name}\` found in the template modules`);
}
