// Generate docs/code-map/engine-structure.md — the engine's structure census.
//
// The hand-written maps in docs/code-map/ carry ROLES and CONTRACTS; this file
// carries what can be COUNTED, so it is generated and can never go stale:
//
//   1. crate layers, from each engine/*/Cargo.toml (run vs dev deps),
//   2. the dispatch/walk index — per file, how many variants of each item-tree
//      enum it matches, and which files recurse through a nesting variant. A
//      shape copied N times shows up as N rows; a copy that missed a variant
//      shows its gap in the "missing" column,
//   3. the per-crate module tree: every non-test .rs file, its line count and
//      the first sentence of its `//!` role header.
//
// Usage (always through make, inside $(NODE_IMAGE), so local and CI agree
// byte for byte):
//   node scripts/gen-engine-map.mjs           write the map   (make engine:map)
//   node scripts/gen-engine-map.mjs --check   fail on drift   (make engine:map-check)
//
// The sections can also be scoped to a set of crates and spliced into the
// marked block of an existing markdown file (--into / --crates, see main), so
// a hand-written component map can carry its own generated census.
//
// Determinism: no timestamps, no locale-aware formatting or collation (every
// sort compares code units), no dependency on git or on file-system order.
// Zero npm dependencies, so the container needs nothing installed.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const ENGINE = join(ROOT, 'engine');
const OUT_REL = 'docs/code-map/engine-structure.md';
const OUT = join(ROOT, OUT_REL);

// The line budget's numbers (scripts/check-line-budget.sh). NEAR marks a file
// within 10% of the cap — the one about to need a seam.
const HARD_MAX = 300;
const NEAR = 270;

// The item-tree enums whose dispatch is worth indexing. Only the enum's
// LOCATION is declared here: its variants, and which of them nest further
// items, are parsed from the source — so adding a variant needs no edit here.
const TREE_ENUMS = [
  { name: 'Item', file: 'core/src/template.rs', note: 'the template wire tree' },
  { name: 'LayoutItem', file: 'layout/src/tree.rs', note: 'the layout tree (layout↔renderer contract)' },
];

// The line budget's test rule, verbatim: test files are a list of cases, not
// a unit of design, so they are summarised rather than indexed.
const isTest = (p) => /(^|\/)tests\//.test(p) || /(^|\/)tests\.rs$/.test(p) || /_tests\.rs$/.test(p);

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === 'target') continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.rs')) out.push(p);
  }
  return out;
}

const lineCount = (text) => (text.match(/\n/g) || []).length;

// Text with `//` comment lines blanked, so a doc comment naming a variant is
// not read as a dispatch arm.
const codeOnly = (text) =>
  text
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');

// The body between the `{` that follows `start` and its matching `}`.
function braceBody(text, start) {
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces after offset ${start}`);
}

// ---- crates and dependency layers -----------------------------------------

function parseCargo(dir) {
  const text = readFileSync(join(ENGINE, dir, 'Cargo.toml'), 'utf8');
  let section = '';
  let name = null;
  const run = new Set();
  const dev = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1];
      // `[dependencies.shojiku-x]` table form.
      const table = section.match(/(^|\.)((?:build-|dev-)?dependencies)\.(shojiku-[\w-]+)$/);
      if (table) (table[2] === 'dev-dependencies' ? dev : run).add(table[3]);
      continue;
    }
    if (section === 'package') {
      const m = line.match(/^name\s*=\s*"([^"]+)"/);
      if (m) name = m[1];
    }
    const kind = section.match(/(^|\.)((?:build-|dev-)?dependencies)$/);
    const dep = line.match(/^(shojiku-[\w-]+)\s*=/);
    if (kind && dep) (kind[2] === 'dev-dependencies' ? dev : run).add(dep[1]);
  }
  if (!name) throw new Error(`engine/${dir}/Cargo.toml has no [package] name`);
  return { dir, name, run, dev };
}

function workspaceMembers() {
  const text = readFileSync(join(ENGINE, 'Cargo.toml'), 'utf8');
  const m = text.match(/^members\s*=\s*\[([^\]]*)\]/m);
  if (!m) throw new Error('engine/Cargo.toml: no workspace members list');
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

function crates() {
  const dirs = readdirSync(ENGINE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(ENGINE, e.name, 'Cargo.toml')))
    .map((e) => e.name)
    .sort(byCodeUnit);
  const list = dirs.map(parseCargo);
  const byName = new Map(list.map((c) => [c.name, c]));
  const layer = new Map();
  const visit = (c, stack) => {
    if (layer.has(c.name)) return layer.get(c.name);
    if (stack.has(c.name)) throw new Error(`dependency cycle through ${c.name}`);
    stack.add(c.name);
    let l = 0;
    for (const d of c.run) {
      const dep = byName.get(d);
      if (!dep) throw new Error(`${c.name} depends on unknown crate ${d}`);
      l = Math.max(l, visit(dep, stack) + 1);
    }
    stack.delete(c.name);
    layer.set(c.name, l);
    return l;
  };
  const members = workspaceMembers();
  for (const c of list) {
    c.layer = visit(c, new Set());
    c.member = members.has(c.dir);
  }
  return list;
}

// The file's role: the FIRST SENTENCE of its leading `//!` paragraph. Not the
// first line — role sentences routinely wrap, and more than half of them would
// be cut mid-clause. The paragraph ends at the first blank `//!` line or at
// the first non-`//!` line; the sentence at a `.`/`!`/`?` followed by
// whitespace or the end (`e.g.` / `i.e.` / `etc.` / `vs.` do not end one).
function roleSentence(text) {
  const para = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('//!')) break;
    const t = line.slice(3).trim();
    if (t === '') break;
    para.push(t);
  }
  if (para.length === 0) return '(no //! header)';
  const joined = para.join(' ');
  const end = joined.search(/(?<!\b(?:e\.g|i\.e|etc|vs))[.!?](?=\s|$)/);
  return end < 0 ? joined : joined.slice(0, end + 1);
}

// ---- files ----------------------------------------------------------------

function files() {
  const all = walk(ENGINE)
    .map((abs) => {
      const rel = relative(ENGINE, abs).split('\\').join('/');
      const text = readFileSync(abs, 'utf8');
      return {
        rel,
        crate: rel.split('/')[0],
        text,
        lines: lineCount(text),
        header: roleSentence(text),
        test: isTest(rel),
        waived: text.includes('line-budget-exempt:'),
      };
    })
    .sort((a, b) => byCodeUnit(a.rel, b.rel));
  // Fail closed on a broken walk: an empty census would regenerate as an
  // empty map and the drift check would happily compare two empty files.
  if (all.length < 100) throw new Error(`only ${all.length} .rs files found under engine/ — the walk is broken`);
  return all;
}

// ---- tree enums: variants, nesting variants, per-file dispatch ------------

function treeEnum(spec, all) {
  const src = all.find((f) => f.rel === spec.file);
  if (!src) throw new Error(`tree enum file engine/${spec.file} not found`);
  const at = src.text.search(new RegExp(`\\benum ${spec.name}\\s*\\{`));
  if (at < 0) throw new Error(`enum ${spec.name} not found in engine/${spec.file}`);
  const variants = [];
  for (const line of codeOnly(braceBody(src.text, at)).split('\n')) {
    const m = line.match(/^\s*([A-Z]\w*)\s*(?:\(\s*(?:Box\s*<\s*)?([A-Za-z_]\w*))?/);
    if (m) variants.push({ name: m[1], payload: m[2] || null });
  }
  if (variants.length === 0) throw new Error(`enum ${spec.name} parsed with no variants`);
  // A nesting variant is one whose payload struct (in the same crate) holds
  // a `Vec<Enum>` field.
  const crate = spec.file.split('/')[0];
  const own = all.filter((f) => f.crate === crate && !f.test);
  const vecOf = new RegExp(`Vec<\\s*${spec.name}\\s*>`);
  for (const v of variants) {
    if (!v.payload) continue;
    for (const f of own) {
      const s = f.text.search(new RegExp(`\\bstruct ${v.payload}\\s*\\{`));
      if (s >= 0 && vecOf.test(braceBody(f.text, s))) v.nests = true;
    }
  }
  return { ...spec, variants };
}

// Occurrences of `Enum::Variant(` not preceded by an identifier character —
// so `LayoutItem::Clip(` never counts as `Item::Clip(`.
function arms(text, enumName, variant) {
  const re = new RegExp(`(?<![A-Za-z0-9_])${enumName}::${variant}\\(`, 'g');
  return (text.match(re) || []).length;
}

// ---- rendering --------------------------------------------------------------

// Everything the sections are drawn from, read once.
function model() {
  const all = files();
  return {
    crates: crates().sort((a, b) => a.layer - b.layer || byCodeUnit(a.dir, b.dir)),
    all,
    enums: TREE_ENUMS.map((s) => treeEnum(s, all)),
    code: new Map(all.filter((f) => !f.test).map((f) => [f.rel, codeOnly(f.text)])),
  };
}

// The three census sections, restricted to the crates in `scope` (a set of
// crate directory names; null = the whole engine). Scoped output is what a
// per-component map's generated block will carry: its crates' layer rows,
// their files' dispatch rows, their module trees.
function sections(m, scope = null) {
  const inScope = (dir) => scope === null || scope.has(dir);
  const crateOf = (rel) => rel.split('/')[0];
  const short = (n) => n.replace(/^shojiku-/, '');
  const layered = m.crates.filter((c) => inScope(c.dir));
  const o = [];
  const p = (s = '') => o.push(s);

  // 1. layers
  p('## 1. Crate layers');
  p();
  p('Layer = longest chain of run deps (`[dependencies]`, `[build-dependencies]`,');
  p('target-specific) down to a crate with none. Dev deps do not layer. Names');
  p('drop the `shojiku-` prefix; a crate depends only on lower layers.');
  p();
  p('| L | crate | run deps | dev-only deps |');
  p('| --- | --- | --- | --- |');
  for (const c of layered) {
    const run = [...c.run].map(short).sort(byCodeUnit).join(', ') || '—';
    const dev = [...c.dev].filter((d) => !c.run.has(d)).map(short).sort(byCodeUnit).join(', ') || '—';
    const tag = c.member ? '' : ' (not a workspace member)';
    p(`| ${c.layer} | \`${c.dir}\`${tag} | ${run} | ${dev} |`);
  }
  p();

  // 2. dispatch
  p('## 2. Dispatch / walk index');
  p();
  p('Non-test files only. An ARM is a distinct variant matched as');
  p('`Enum::Variant(`; comment lines are ignored. Several files at the full');
  p('count are one per-variant shape copied several times: a change to that');
  p('shape is owed to each of them. A file matching at least half the variants');
  p('lists the ones it does NOT match, which is where a copy that missed a');
  p('variant shows.');
  const code = [...m.code].filter(([rel]) => inScope(crateOf(rel)));
  for (const e of m.enums) {
    const n = e.variants.length;
    const rows = [];
    for (const [rel, text] of code) {
      const hit = e.variants.filter((v) => arms(text, e.name, v.name) > 0).map((v) => v.name);
      if (hit.length > 0) rows.push({ rel, hit });
    }
    if (rows.length === 0) continue;
    rows.sort((a, b) => b.hit.length - a.hit.length || byCodeUnit(a.rel, b.rel));
    p();
    p(`### \`${e.name}\` — ${e.note}`);
    p();
    p(`\`engine/${e.file}\`, ${n} variants: ${e.variants.map((v) => v.name).join(', ')}.`);
    p();
    p('| arms | file | missing |');
    p('| --- | --- | --- |');
    for (const r of rows) {
      const missing = r.hit.length * 2 >= n && r.hit.length < n
        ? e.variants.filter((v) => !r.hit.includes(v.name)).map((v) => v.name).join(', ')
        : '';
      p(`| ${r.hit.length}/${n} | \`${r.rel}\` | ${missing} |`);
    }
    for (const v of e.variants.filter((x) => x.nests)) {
      const rec = [];
      for (const [rel, text] of code) {
        const k = arms(text, e.name, v.name);
        if (k > 0) rec.push({ rel, k });
      }
      if (rec.length === 0) continue;
      rec.sort((a, b) => b.k - a.k || byCodeUnit(a.rel, b.rel));
      p();
      p(`**Recursion through \`${e.name}::${v.name}\`** (its \`${v.payload}\` holds`);
      p(`\`Vec<${e.name}>\`) — every file that matches it, with occurrence count:`);
      p();
      for (const r of rec) p(`- ${r.k} \`${r.rel}\``);
    }
  }
  p();

  // 3. module tree
  p('## 3. Module tree');
  p();
  p(`Every non-test \`.rs\` file: path (from the crate), line count, and the`);
  p(`first sentence of its \`//!\` header.`);
  p(`▲ = within 10% of the ${HARD_MAX}-line cap (≥${NEAR}); ■ = over it under a`);
  p('`line-budget-exempt` waiver. Test files are summarised per crate.');
  for (const c of layered) {
    const mine = m.all.filter((f) => f.crate === c.dir);
    const src = mine.filter((f) => !f.test);
    const tests = mine.filter((f) => f.test);
    const sum = (xs) => xs.reduce((a, f) => a + f.lines, 0);
    p();
    p(`### \`${c.dir}\` (L${c.layer}) — ${src.length} files / ${sum(src)} lines; tests ${tests.length} files / ${sum(tests)} lines`);
    p();
    for (const f of src) {
      const mark = f.lines > HARD_MAX ? ' ■' : f.lines >= NEAR ? ' ▲' : '';
      p(`- \`${f.rel.slice(c.dir.length + 1)}\` ${f.lines}${mark} — ${f.header}`);
    }
  }
  return o.join('\n');
}

// The whole-engine map: the preamble, then every section unscoped.
function fullDocument(m) {
  return `${[
    '# Engine structure map (GENERATED)',
    '',
    '> AI-only. **GENERATED by `scripts/gen-engine-map.mjs` — never hand-edit.**',
    '> `make engine:map` regenerates it; `make engine:map-check` (part of',
    '> `make engine:lint`, so CI runs it on every `.rs` / `Cargo.toml` change)',
    '> fails on drift. A merge conflict in this file is resolved by',
    '> regenerating, never by hand. This is the COUNTED half of the code map;',
    '> roles and contracts live in the hand-written per-component maps',
    '> ([README](README.md) routes them).',
    '',
    sections(m),
  ].join('\n')}\n`;
}

// Replace ONLY the text between the two markers of an existing markdown file,
// leaving the hand-written rest byte-for-byte. A file without exactly one
// well-ordered marker pair is an error rather than an append: a lost marker
// must not silently turn into a second generated block.
const START = '<!-- generated:start -->';
const END = '<!-- generated:end -->';
function spliceBlock(text, body, rel) {
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s < 0 || e < s || text.indexOf(START, s + 1) >= 0 || text.indexOf(END, e + 1) >= 0) {
    throw new Error(`${rel}: needs exactly one ${START} … ${END} pair`);
  }
  return `${text.slice(0, s + START.length)}\n${body}\n${text.slice(e)}`;
}

// ---- main -------------------------------------------------------------------
//
// Two shapes, one write/check path:
//   (default)                         the whole map -> docs/code-map/engine-structure.md
//   --into <md> --crates a,b[,c]      the scoped sections -> the marked block of <md>
// Either takes --check (compare, never write).

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
}

const m = model();
const intoRel = arg('--into');
let targetRel;
let next;
if (intoRel) {
  const list = arg('--crates');
  if (!list) throw new Error('--into needs --crates <dir,dir,…>');
  const scope = new Set(list.split(','));
  for (const d of scope) {
    if (!m.crates.some((c) => c.dir === d)) throw new Error(`--crates: no engine crate "${d}"`);
  }
  targetRel = intoRel;
  next = spliceBlock(readFileSync(join(ROOT, intoRel), 'utf8'), sections(m, scope), intoRel);
} else {
  targetRel = OUT_REL;
  next = fullDocument(m);
}
const target = join(ROOT, targetRel);
if (process.argv.includes('--check')) {
  const have = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (have !== next) {
    const a = have.split('\n');
    const b = next.split('\n');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    console.error(`engine-map: ${targetRel} is out of date with the engine tree.`);
    console.error(`  first difference at line ${i + 1}:`);
    console.error(`    committed: ${a[i] ?? '(end of file)'}`);
    console.error(`    generated: ${b[i] ?? '(end of file)'}`);
    console.error('  fix: make engine:map   (then commit the regenerated file; never hand-edit it)');
    process.exit(1);
  }
  console.log(`engine-map: ${targetRel} is current`);
} else {
  writeFileSync(target, next);
  console.log(`engine-map: wrote ${targetRel} (${lineCount(next)} lines)`);
}
