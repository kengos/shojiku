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
import { SELECTION_SEP } from '../data/editorModel';
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
