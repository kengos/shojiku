// @vitest-environment node
//
// Real-engine evidence (never a mock) that what the data-item editor WRITES into
// definitions is a document the engine reads: the ops its tree editing authors —
// adding each of the seven kinds at the top, into a group and into a table's
// rows; ticking and unticking required at each kind of parent (the root, a
// group, a table row — including the untick that removes an emptied list); a
// container's label and description; the root's label, description and
// version — are each applied to a realistic definitions file
// and validated by the wasm engine with no error-severity diagnostic (a
// definitions file the engine cannot parse fails the whole validate as one).
//
// A RENAME crosses the seam twice: the template references it rewrites must
// still resolve against the renamed definitions, and the reference walk that
// finds them must see exactly the carriers the engine checks. A fixture naming
// one data key in every carrier the engine validates is renamed both ways —
// definitions alone (the engine's `unknown_data_key` count must equal the walk's
// reference count: the census positive control) and with the cascade (zero) —
// and a delete reports exactly the places its confirmation names.
//
// The designer unit suites build their expectations on fixtures they wrote
// themselves; this is the suite that crosses the seam. Loads the
// `make engine:wasm` pkg exactly as the other integration suites do.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Op } from '@shojiku/designer-core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyDefinitionOps,
  descriptionOp,
  requiredOp,
  titleOp,
  versionOp,
} from '../data/definitionsEdit';
import { ADD_KINDS, addFieldPlan } from '../data/defsPlan';
import { type DefsNode, readDefsTree } from '../data/defsTree';
import { planDelete } from '../data/deletePlan';
import { SELECTION_SEP } from '../data/editorModel';
import { refsUnder } from '../data/refs/match';
import { type DataRef, DOCUMENT_OWNER } from '../data/refs/types';
import { readDataRefs } from '../data/refs/walk';
import { applyScratch, planRename, type RestructureInput } from '../data/renamePlan';
import { findNode } from '../data/treeModel';
import type { EngineTransport } from '../engine/transport';
import { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';

const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: new () => WasmEngine & { setLocale(id: string, overlay?: string | null): void };
}

async function loadModule(): Promise<WasmModule> {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error('engine/wasm/pkg is missing — run `make engine:wasm` before the gui gates');
  }
  const mod = (await import(PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
  return mod;
}

const BASE = `# The invoice data dictionary.
version: "0.2.0"
type: object
title: Invoice data
required: [ total ]
properties:
  total:
    type: number
    format: currency
  memo:
    type: string
  customer:
    type: object
    title: Customer
    required: [ name ]
    properties:
      name: { type: string }
      tel: { type: string }
  items:
    type: array
    title: Lines
    items:
      type: object
      required: [ qty ]
      properties:
        qty: { type: number }
        unit: { type: string }
`;

const TEMPLATE = [
  'version: 0.1.0',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - { type: text, data: { key: total } }',
  '',
].join('\n');

function node(keys: readonly string[]): DefsNode {
  const tree = readDefsTree(BASE);
  const found = tree === null ? null : findNode(tree, keys.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${keys.join('.')}`);
  }
  return found;
}

function added(parent: readonly string[], kind: (typeof ADD_KINDS)[number]): Op {
  const plan = addFieldPlan(BASE, node(parent), `New ${kind}`, `new_${kind}`, kind);
  if (!plan.ok) {
    throw new Error(plan.reason);
  }
  return plan.op;
}

function must(op: Op | null): Op {
  if (op === null) {
    throw new Error('the builder authored nothing');
  }
  return op;
}

const ITEMS = ['properties', 'items'];

const CASES: readonly [string, Op][] = [
  ...ADD_KINDS.flatMap((kind): [string, Op][] => [
    [`add a ${kind} at the top`, added([], kind)],
    [`add a ${kind} into a group`, added(['properties', 'customer'], kind)],
    [`add a ${kind} into a table's rows`, added(ITEMS, kind)],
  ]),
  ['require a top-level field', must(requiredOp(node(['properties', 'memo']), true))],
  ['unrequire the last top-level field', must(requiredOp(node(['properties', 'total']), false))],
  [
    'require a group child',
    must(requiredOp(node(['properties', 'customer', 'properties', 'tel']), true)),
  ],
  [
    'unrequire the last group child',
    must(requiredOp(node(['properties', 'customer', 'properties', 'name']), false)),
  ],
  [
    'require a table row field',
    must(requiredOp(node([...ITEMS, 'items', 'properties', 'unit']), true)),
  ],
  [
    'unrequire the last table row field',
    must(requiredOp(node([...ITEMS, 'items', 'properties', 'qty']), false)),
  ],
  ['relabel a group', must(titleOp(['properties', 'customer'], 'Customer', 'Bill to'))],
  ['describe a table', must(descriptionOp(ITEMS, '', 'One line per product'))],
  ['relabel the root', must(titleOp([], 'Invoice data', 'Delivery data'))],
  ['clear the root label', must(titleOp([], 'Invoice data', ''))],
  ['describe the root', must(descriptionOp([], '', 'The fields an invoice carries'))],
  ['bump the root version', must(versionOp([], '0.2.0', '0.3.0'))],
  ['clear the root version', must(versionOp([], '0.2.0', ''))],
];

let transport: EngineTransport;

beforeAll(async () => {
  const mod = await loadModule();
  const engine = new mod.Engine();
  engine.setLocale('en-US', null);
  transport = createWasmTransport(engine);
});

const errors = (items: readonly { severity: string; code: string }[]) =>
  items.filter((d) => d.severity === 'error').map((d) => d.code);

describe('definitions the data-item editor authors, read by the real engine', () => {
  it('validates the untouched base clean (the control the cases below move from)', async () => {
    const diagnostics = await transport.validate(TEMPLATE, '{}', BASE);
    expect(errors(diagnostics.items)).toEqual([]);
  });

  it('reports a definitions file the engine cannot read (the suite can fail)', async () => {
    const broken = BASE.replace('    type: string\n', '    type: string\n    lable: x\n');
    const diagnostics = await transport.validate(TEMPLATE, '{}', broken);
    expect(errors(diagnostics.items)).not.toEqual([]);
  });

  for (const [title, op] of CASES) {
    it(`${title}: the op lands and the engine reads the result`, async () => {
      const text = applyDefinitionOps(BASE, [op]);
      // The op really changed the document (a refused op is skipped silently).
      expect(text).not.toBe(BASE);
      const diagnostics = await transport.validate(TEMPLATE, '{}', text);
      expect(errors(diagnostics.items)).toEqual([]);
    });
  }
});

const CENSUS_DEFS = `type: object
properties:
  amt: { type: number }
  flag: { type: boolean }
  rows:
    type: array
    items:
      type: object
      properties:
        amt: { type: number }
        flag: { type: boolean }
`;

/** One reference in every carrier the engine validates (the body + the
 * document block): to the top-level \`amt\` / \`flag\`, and in the rows of
 * \`rows\` to its own \`amt\` / \`flag\`. */
const CENSUS = `document:
  title: "{amt}"
  description: "{amt}"
  language: "{amt}"
  keywords: ["{amt}"]
  authors: ["{amt}"]
sections:
  body:
    type: flow
    items:
      - type: text
        data: { key: amt }
        link: { url: "https://e.test/{amt}" }
        mark: { data: { key: flag } }
        visible: { key: flag }
      - { type: text, text: "x {amt}" }
      - type: text
        spans:
          - { data: { key: amt } }
          - { text: "y {amt}", link: { url: "https://e.test/{amt}" } }
      - { type: text, text: "{n}", bindings: { n: { key: amt } } }
      - { type: image, data: { key: amt }, link: { url: "https://e.test/{amt}" } }
      - { type: image, src: a.png, link: { url: "https://e.test/{n}" }, bindings: { n: { key: amt } } }
      - { type: qr_code, data: { key: amt } }
      - { type: qr_code, text: "{amt}" }
      - { type: qr_code, text: "{n}", bindings: { n: { key: amt } } }
      - { type: char_grid, data: { key: amt }, grid: { charsPerLine: 3, lines: 1, cellSize: 18 } }
      - { type: char_grid, text: "{amt}", grid: { charsPerLine: 3, lines: 1, cellSize: 18 } }
      - { type: char_grid, text: "{n}", bindings: { n: { key: amt } }, grid: { charsPerLine: 3, lines: 1, cellSize: 18 } }
      - { type: ellipse, data: { key: flag } }
      - { type: checkbox, data: { key: flag } }
      - { type: list, data: { key: rows }, text: "{amt} {n}", bindings: { n: { key: flag } } }
      - type: table
        data: { key: rows }
        columns:
          - { data: { key: amt } }
          - cell:
              items:
                - { type: text, data: { key: flag } }
                - { type: text, data: { key: amt, scope: document } }
        row:
          conditionalStyles:
            - { when: { key: flag }, style: { textAlign: center } }
      - type: repeat
        data: { key: rows }
        cell: { items: [ { type: text, text: "{amt}" } ] }
      - type: repeat_flow
        data: { key: rows }
        item: { items: [ { type: text, data: { key: amt } } ] }
`;

const CENSUS_PARAMS = JSON.stringify({ amt: 1, flag: true, rows: [{ amt: 2, flag: false }] });

function censusInput(): RestructureInput {
  return {
    definitions: CENSUS_DEFS,
    base: CENSUS_DEFS,
    edits: [],
    templateText: CENSUS,
    refs: readDataRefs(CENSUS),
    maxBytes: 1_048_576,
    sampleSet: { active: 'd', variants: [{ id: 'd', text: CENSUS_PARAMS, origin: 'preset' }] },
  };
}

function censusNode(keys: readonly string[]): DefsNode {
  const tree = readDefsTree(CENSUS_DEFS);
  const found = tree === null ? null : findNode(tree, keys.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${keys.join('.')}`);
  }
  return found;
}

/** Where the engine reports a reference: the item (or span / column / row
 * condition), a `visible:` or text mark at its own key, a declaration by its
 * name, a document string by its field — and a document list by its element
 * (the fixture's lists hold one each). */
function diagnosticPath(ref: DataRef): string {
  if (ref.carrier === 'declaration') {
    return `${ref.path}.bindings.${ref.keys[1]}`;
  }
  if (ref.carrier === 'visible' || ref.keys[0] === 'mark') {
    return `${ref.path}.${ref.keys[0]}`;
  }
  if (ref.path === DOCUMENT_OWNER) {
    return `document.${ref.keys[0]}${ref.form === 'strings' ? '[0]' : ''}`;
  }
  return ref.path;
}

const unknown = (items: readonly { code: string; path?: string | null }[]) =>
  items.filter((d) => d.code === 'unknown_data_key');

const ROW = ['properties', 'rows', 'items', 'properties'];
const NODES: readonly (readonly string[])[] = [
  ['properties', 'amt'],
  ['properties', 'flag'],
  ['properties', 'rows'],
  [...ROW, 'amt'],
  [...ROW, 'flag'],
];

describe('a rename cascade, read by the real engine', () => {
  it('validates the census fixture clean (no reference is undefined to start with)', async () => {
    const diagnostics = await transport.validate(CENSUS, CENSUS_PARAMS, CENSUS_DEFS);
    expect(diagnostics.items.filter((d) => d.severity === 'error')).toEqual([]);
    expect(unknown(diagnostics.items)).toEqual([]);
  });

  for (const keys of NODES) {
    const label = keys.filter((key) => key !== 'properties' && key !== 'items').join('.');
    it(`${label}: the engine finds exactly the references the walk finds (census control)`, async () => {
      const node = censusNode(keys);
      const refs = refsUnder(censusInput().refs?.refs ?? [], node);
      expect(refs.length).toBeGreaterThan(0);
      const renamedOnly = applyDefinitionOps(CENSUS_DEFS, [{ op: 'renameKey', keys, to: 'zz' }]);
      const diagnostics = await transport.validate(CENSUS, CENSUS_PARAMS, renamedOnly);
      // The engine reports a key once per place (an item's text and link naming
      // it are one diagnostic), so the census is compared as the SET of places.
      const places = (paths: readonly string[]) => [...new Set(paths)].sort();
      expect(places(unknown(diagnostics.items).map((d) => d.path ?? ''))).toEqual(
        places(refs.map(diagnosticPath)),
      );
    });

    it(`${label}: the cascade leaves nothing undefined and the documents parse`, async () => {
      const plan = planRename(censusInput(), censusNode(keys), 'zz');
      if (!plan.ok) {
        throw new Error(plan.reason);
      }
      const template = applyScratch(CENSUS, plan.templateOps, 1_048_576) ?? '';
      const defs = applyDefinitionOps(CENSUS_DEFS, plan.edits);
      const params = plan.sampleSet.variants[0]?.text ?? '';
      expect(template).not.toBe(CENSUS);
      const diagnostics = await transport.validate(template, params, defs);
      expect(errors(diagnostics.items)).toEqual([]);
      expect(unknown(diagnostics.items)).toEqual([]);
    });
  }

  it('a delete leaves its references, which the engine reports at exactly those places', async () => {
    const node = censusNode(['properties', 'amt']);
    const plan = planDelete(censusInput(), node);
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    const defs = applyDefinitionOps(CENSUS_DEFS, plan.edits);
    const diagnostics = await transport.validate(
      CENSUS,
      plan.sampleSet.variants[0]?.text ?? '',
      defs,
    );
    const refs = refsUnder(censusInput().refs?.refs ?? [], node);
    const places = (paths: readonly string[]) => [...new Set(paths)].sort();
    expect(places(unknown(diagnostics.items).map((d) => d.path ?? ''))).toEqual(
      places(refs.map(diagnosticPath)),
    );
  });
});

describe('the carriers only the GUI walks (layout reads them, validate does not)', () => {
  const ONLY_GUI = `sections:
  header:
    items:
      - type: table
        data: { key: zz_rows }
        columns: [ { data: { key: zz_col } } ]
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        headerGroups: [ { label: "{zz_group}", span: 1 } ]
        columns: [ { label: "{zz_label}", data: { key: amt } } ]
`;

  it('the walk finds them and the engine reports none — the GUI rewrites them on its own', async () => {
    const spelled = (readDataRefs(ONLY_GUI)?.refs ?? []).map((ref) => ref.spelled);
    expect(spelled).toEqual(expect.arrayContaining(['zz_rows', 'zz_col', 'zz_group', 'zz_label']));
    const diagnostics = await transport.validate(ONLY_GUI, CENSUS_PARAMS, CENSUS_DEFS);
    expect(unknown(diagnostics.items)).toEqual([]);
  });
});
