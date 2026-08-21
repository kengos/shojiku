/// <reference types="node" />
// Rewrite every bundled example's `templates.yml` to the Designer's canonical
// CST fixed point (`serializeTemplate`). Run with
// `pnpm --filter @shojiku/designer-core normalize:examples`.
//
// Semantics-neutral: parse -> serialize preserves comments and key order; only
// flow-collection spacing (`[x]` -> `[ x ]`) and blank-line runs normalize, so
// rendered output is unchanged and `make examples:check` stays byte-green. The
// enforcing gate is the fixed-point suite (`roundtrip.test.ts`); this script is
// the one-shot that gets a drifted file back onto the fixed point.

import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTemplate, serializeTemplate } from '../src/document.ts';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
// Two levels: `examples/<bucket>/<name>/` (bucketed by document kind).
const files = globSync(join(repoRoot, 'examples', '*', '*', 'templates.yml')).sort();

// A glob that matches nothing would "succeed" having normalized nothing, and
// the drift it was run to fix would surface later as a red round-trip suite.
if (files.length === 0) {
  throw new Error(`normalize:examples: no examples/*/*/templates.yml under ${repoRoot}`);
}

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const canonical = serializeTemplate(parseTemplate(src));
  if (canonical === src) {
    console.log(`  fixed point: ${file}`);
    continue;
  }
  writeFileSync(file, canonical);
  changed += 1;
  console.log(`  normalized:  ${file}`);
}
console.log(`normalize:examples — ${changed} of ${files.length} file(s) rewritten`);
