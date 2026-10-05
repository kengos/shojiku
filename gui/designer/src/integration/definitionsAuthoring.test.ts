// @vitest-environment node
//
// Real-engine evidence (never a mock) that what the data-item editor WRITES into
// definitions is a document the engine reads: the ops its tree editing authors —
// adding each of the seven kinds at the top, into a group and into a table's
// rows; ticking and unticking required at each kind of parent (the root, a
// group, a table row — including the untick that removes an emptied list); a
// container's label and description; the root's label, description and
// version; and the value rules — choices (bare, labeled, typed, reordered,
// removed), every range key, the placeholder, the example per type and a list
// element's own keys — are each applied to a realistic definitions file
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
// CHOICES cross it too: the editor's labels-ignored notice is a mirror of an
// engine warning, so each (type, format) arm is validated and the two must
// agree; the longest lists the editor can write must parse; and a member typed
// by the field must match exactly the data of that type.
//
// The DISPLAY keys cross it as well: every display op (currency, decimal
// places, unit, default and declared display formats — the longest lists the
// editor can write included —, the hints for other tools and a table's row
// name) parses; the hint bag merge keeps a hand-written key; the engine's
// format catalog over the currency-swapped document copy samples the field's
// own currency; and a declared format list narrows the placement picks that
// validate, exactly as the list's hint says.
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
  formatOp,
  requiredOp,
  titleOp,
  typeOp,
  versionOp,
} from '../data/definitionsEdit';
import { ADD_KINDS, addFieldPlan } from '../data/defsPlan';
import { type DefsNode, readDefsTree } from '../data/defsTree';
import { planDelete } from '../data/deletePlan';
import { addFormat, type FormatRow, writeFormats } from '../data/displayFormatsModel';
import { currencyOp, displayFormatOp, precisionOp, unitOp } from '../data/displayRules';
import { SELECTION_SEP } from '../data/editorModel';
import { addRow, moveRow, removeRow, setRowLabel, setRowValue } from '../data/enumEdits';
import { type EnumRow, writeRows } from '../data/enumModel';
import { labelsIgnored } from '../data/enumRules';
import { boldOp, readRecommended, rowTitleOp, textAlignOp } from '../data/recommendedStyle';
import { refsUnder } from '../data/refs/match';
import { type DataRef, DOCUMENT_OWNER } from '../data/refs/types';
import { readDataRefs } from '../data/refs/walk';
import { applyScratch, planRename, type RestructureInput } from '../data/renamePlan';
import { findNode } from '../data/treeModel';
import { exampleOp, placeholderOp, rangeOp } from '../data/valueRules';
import type { EngineTransport } from '../engine/transport';
import { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';
import { withCurrency } from '../formats/currencyCopy';
import { catalogAtCurrency } from '../hooks/useFormatCatalog';

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
  status:
    type: string
    enum: [ draft, sent ]
  count: { type: integer }
  paid: { type: boolean }
  tags:
    type: array
    items: { type: string }
  untyped: { type: array }
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

/** The op of an edit the builder took (a value-rule builder answers a refusal
 * or an op). */
function taken(edit: { ok: true; op: Op | null } | { ok: false; refusal: string }): Op {
  if (!edit.ok) {
    throw new Error(edit.refusal);
  }
  return must(edit.op);
}

function must(op: Op | null): Op {
  if (op === null) {
    throw new Error('the builder authored nothing');
  }
  return op;
}

const ITEMS = ['properties', 'items'];
const at = (...names: string[]) => names.flatMap((name) => ['properties', name]);
const TAG = [...at('tags'), 'items'];
const STATUS_ROWS: readonly EnumRow[] = [
  { value: 'draft', label: '', labeled: false },
  { value: 'sent', label: '', labeled: false },
];

/** The value-rule op builders' output — choices, ranges, the placeholder, the
 * example, a list element's keys — each a document the engine reads. */
const VALUE_RULE_CASES: readonly [string, Op][] = [
  [
    'choices on a text field',
    taken(addRow({ keysPath: at('memo'), type: 'string', rows: [] }, 'a', '')),
  ],
  [
    'labeled choices on a text field',
    taken(
      setRowLabel({ keysPath: at('status'), type: 'string', rows: STATUS_ROWS }, 1, '送付済み'),
    ),
  ],
  ['number choices', taken(addRow({ keysPath: at('total'), type: 'number', rows: [] }, '1.5', ''))],
  ['integer choices', taken(addRow({ keysPath: at('count'), type: 'integer', rows: [] }, '7', ''))],
  ['remove the choices', taken(writeRows(at('status'), []))],
  [
    'change a choice’s value',
    taken(setRowValue({ keysPath: at('status'), type: 'string', rows: STATUS_ROWS }, 0, 'void')),
  ],
  [
    'remove one choice of several',
    taken(removeRow({ keysPath: at('status'), type: 'string', rows: STATUS_ROWS }, 0)),
  ],
  [
    'a negative-zero minimum length (written as 0)',
    taken(rangeOp(at('memo'), 'minLength', '', '-0')),
  ],
  [
    'the type of an untyped list’s element (the only edit offered there first)',
    must(typeOp([...at('untyped'), 'items'], '', 'string')),
  ],
  [
    'reorder the choices',
    must(moveRow({ keysPath: at('status'), type: 'string', rows: STATUS_ROWS }, 0, 2)),
  ],
  ['a minimum length', taken(rangeOp(at('memo'), 'minLength', '', '0'))],
  ['a maximum length', taken(rangeOp(at('memo'), 'maxLength', '', '40'))],
  ['a minimum value', taken(rangeOp(at('total'), 'minimum', '', '-1.5'))],
  ['a maximum value', taken(rangeOp(at('total'), 'maximum', '', '1e6'))],
  ['a minimum row count', taken(rangeOp(ITEMS, 'minItems', '', '1'))],
  ['a maximum row count', taken(rangeOp(ITEMS, 'maxItems', '', '30'))],
  ['a list value count', taken(rangeOp(at('tags'), 'maxItems', '', '5'))],
  ['each list value’s length', taken(rangeOp(TAG, 'maxLength', '', '12'))],
  ['each list value’s type', must(typeOp(TAG, 'string', 'number'))],
  ['each list value’s format', must(formatOp(TAG, '', 'date'))],
  ['each list value’s placeholder', must(placeholderOp(TAG, '', '-'))],
  [
    'each list value’s choices',
    taken(addRow({ keysPath: TAG, type: 'string', rows: [] }, 'red', '赤')),
  ],
  ['a placeholder', must(placeholderOp(at('memo'), '', '（未記入）'))],
  ['a text example', taken(exampleOp(at('memo'), 'string', undefined, '0012'))],
  ['a number example', taken(exampleOp(at('total'), 'number', undefined, '1200.5'))],
  ['an integer example', taken(exampleOp(at('count'), 'integer', undefined, '3'))],
  ['a yes / no example', taken(exampleOp(at('paid'), 'boolean', undefined, 'true'))],
];

const formatRows = (count: number, label: string): FormatRow[] =>
  Array.from({ length: count }, (_, i) => ({ id: `v${i}`, label }));

/** The display op builders' output — each a document the engine reads. */
const DISPLAY_CASES: readonly [string, Op][] = [
  ['a currency code', must(currencyOp(at('total'), '', 'USD'))],
  ['no decimal places', taken(precisionOp(at('total'), '', '0'))],
  ['the most decimal places', taken(precisionOp(at('total'), '', '20'))],
  ['a negative-zero decimal places (written as 0)', taken(precisionOp(at('total'), '', '-0'))],
  ['the pack unit', must(unitOp(at('count'), '', 'item'))],
  ['a unit the packs do not declare', must(unitOp(at('count'), '', 'kg'))],
  ['a default display format', must(displayFormatOp(at('total'), '', 'symbol'))],
  ['the longest labeled format list', taken(writeFormats(at('total'), formatRows(85, 'n')))],
  ['the longest unlabeled format list', taken(writeFormats(at('total'), formatRows(127, '')))],
  [
    'a mixed format list',
    taken(addFormat({ keysPath: at('memo'), rows: [{ id: 'long', label: 'Long' }] }, 'x', '')),
  ],
  [
    'an alignment hint (creating the bag)',
    must(textAlignOp(at('total'), readRecommended(BASE, at('total')), 'right')),
  ],
  ['a bold hint', must(boldOp(at('memo'), readRecommended(BASE, at('memo')), true))],
  ['a table row name', must(rowTitleOp(ITEMS, '', 'Line'))],
];

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
  ...VALUE_RULE_CASES,
  ...DISPLAY_CASES,
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

describe('choices, read by the real engine', () => {
  const labeledDefs = (type: string, format: string) =>
    `type: object\nproperties:\n  f:\n    type: ${type}\n${
      format === '' ? '' : `    format: ${format}\n`
    }    enum: [ { value: ${type === 'boolean' ? 'true' : type === 'string' ? 'a' : '1'}, label: L } ]\n`;
  const ROWS: readonly EnumRow[] = [{ value: 'a', label: 'L', labeled: true }];
  const BOUND_TO_F = TEMPLATE.replace('key: total', 'key: f');

  // The mirror decides the editor's notice; the engine decides the warning.
  // Each arm is checked both ways, so a mirror that always said "ignored" (or
  // never did) fails here.
  for (const [type, format] of [
    ['string', ''],
    ['string', 'person-name'],
    ['string', 'date'],
    ['string', 'date-time'],
    ['string', 'image'],
    ['number', ''],
    ['number', 'currency'],
    ['integer', 'percentage'],
    ['boolean', ''],
  ]) {
    it(`labels on (${type}, ${format || 'no format'}): the notice agrees with the engine`, async () => {
      const diagnostics = await transport.validate(BOUND_TO_F, '{}', labeledDefs(type, format));
      expect(errors(diagnostics.items)).toEqual([]);
      const warned = diagnostics.items.some((d) => d.code === 'definitions_enum_labels_ignored');
      expect(warned).toBe(labelsIgnored(type, format, ROWS));
    });
  }

  it('accepts the longest lists the editor can write (all bare, all labeled)', async () => {
    const bare = Array.from({ length: 255 }, (_, i) => `v${i}`);
    const labeled = Array.from({ length: 85 }, (_, i) => ({ value: `v${i}`, label: `L${i}` }));
    for (const rows of [
      bare.map((value) => ({ value, label: '', labeled: false })),
      labeled.map(({ value, label }) => ({ value, label, labeled: true })),
    ]) {
      const text = applyDefinitionOps(BASE, [taken(writeRows(at('memo'), rows))]);
      expect(text).not.toBe(BASE);
      const diagnostics = await transport.validate(TEMPLATE, '{}', text);
      expect(errors(diagnostics.items)).toEqual([]);
    }
  });

  it('matches the data a member was typed for, and only that', async () => {
    const text = applyDefinitionOps(BASE, [
      taken(addRow({ keysPath: at('count'), type: 'integer', rows: [] }, '7', '')),
      taken(addRow({ keysPath: at('memo'), type: 'string', rows: [] }, '001', '')),
    ]);
    const mismatch = async (params: object) =>
      (await transport.validate(TEMPLATE, JSON.stringify(params), text)).items.filter(
        (d) => d.code === 'params_enum_mismatch',
      ).length;
    expect(await mismatch({ total: 1, count: 7, memo: '001' })).toBe(0);
    expect(await mismatch({ total: 1, count: 8, memo: '1' })).toBe(2);
  });
});

describe('the display keys, read by the real engine', () => {
  const STYLED = BASE.replace(
    '  memo:\n    type: string\n',
    '  memo:\n    type: string\n    recommendedStyle: { color: red }\n',
  );

  it('merges a hint into a hand-written bag, keeping its key, and both parse', async () => {
    const read = readRecommended(STYLED, at('memo'));
    const text = applyDefinitionOps(STYLED, [must(textAlignOp(at('memo'), read, 'center'))]);
    expect(readRecommended(text, at('memo'))).toMatchObject({
      textAlign: 'center',
      others: ['color'],
    });
    const diagnostics = await transport.validate(TEMPLATE, '{}', text);
    expect(errors(diagnostics.items)).toEqual([]);
  });

  it('removes the bag with its last hint, and the result parses', async () => {
    const text = applyDefinitionOps(BASE, [
      must(textAlignOp(at('memo'), readRecommended(BASE, at('memo')), 'left')),
    ]);
    const cleared = applyDefinitionOps(text, [
      must(textAlignOp(at('memo'), readRecommended(text, at('memo')), '')),
    ]);
    expect(cleared).toBe(BASE);
  });

  it('fails the whole file on what the editor refuses (the suite can fail)', async () => {
    for (const bad of ['    precision: 1.5\n', '    displayFormats: [ { id: a, lable: b } ]\n']) {
      const text = BASE.replace('    format: currency\n', `    format: currency\n${bad}`);
      const diagnostics = await transport.validate(TEMPLATE, '{}', text);
      expect(errors(diagnostics.items), bad).not.toEqual([]);
    }
  });

  it('samples the field currency through the document copy the editor asks about', async () => {
    const ask = transport.formatCatalog;
    if (ask === undefined) {
      throw new Error('the wasm transport answers the format catalog');
    }
    const symbol = async (template: string) => {
      const catalog = await ask.call(transport, template, []);
      const currency = catalog.types.find((entry) => entry.fieldType === 'currency');
      return currency?.variants.find((variant) => variant.spelling === 'symbol')?.samples ?? [];
    };
    // The document names no currency, so it samples in the en-US pack's own
    // default (USD); the copy asks about euros — through the hook's own helper.
    const eurCatalog = await catalogAtCurrency(transport, TEMPLATE, 'EUR');
    const eur =
      eurCatalog?.types
        .find((entry) => entry.fieldType === 'currency')
        ?.variants.find((variant) => variant.spelling === 'symbol')?.samples ?? [];
    expect(eur).toHaveLength(1);
    expect(eur[0]).toMatch(/€1,234,567\.89/);
    const own = await symbol(TEMPLATE);
    expect(own[0]).not.toContain('€');
  });

  it('answers no catalog for a document the engine cannot parse, rather than the locale currency', async () => {
    const broken = TEMPLATE.replace('    type: flow\n', '    type: flow\n    lable: x\n');
    expect(withCurrency(broken, 'EUR')).not.toBeNull();
    // The engine itself still answers that copy — at the pack's own currency.
    const ask = transport.formatCatalog;
    const raw = await ask?.call(transport, withCurrency(broken, 'EUR') as string, []);
    const rawSymbol = raw?.types
      .find((entry) => entry.fieldType === 'currency')
      ?.variants.find((variant) => variant.spelling === 'symbol')?.samples[0];
    expect(rawSymbol).not.toContain('€');
    await expect(catalogAtCurrency(transport, broken, 'EUR')).resolves.toBeNull();
  });

  it('narrows the placement picks that validate once formats are declared, as the hint says', async () => {
    const placed = TEMPLATE.replace(
      '      - { type: text, data: { key: total } }',
      '      - { type: text, data: { key: issued, format: wareki } }',
    );
    const withList = (list: string) =>
      BASE.replace(
        '  memo:\n',
        `  issued: { type: string, format: date, displayFormats: ${list} }\n  memo:\n`,
      );
    const unknown = async (defs: string) =>
      (await transport.validate(placed, '{}', defs)).items.filter(
        (d) => d.code === 'unknown_format',
      ).length;
    expect(await unknown(withList('[]'))).toBe(0);
    expect(await unknown(withList('[ { id: long } ]'))).toBe(1);
    expect(await unknown(withList('[ { id: long }, { id: wareki } ]'))).toBe(0);
  });
});
