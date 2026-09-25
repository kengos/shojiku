// @vitest-environment node
//
// The one integration test against the REAL wasm engine (never a mock): it
// loads the `engine/wasm/pkg` module (the `make engine:wasm` artifact, gitignored),
// injects the en-US locale + its font packs bytes-first, and drives the browser
// transport end to end on the receipt-us example. This is the parity evidence
// that the GUI's transport calls the same engine `shojiku render` does.
//
// The pkg is imported DYNAMICALLY (a non-literal specifier) so tsc never binds
// the GUI package to the gitignored artifact; a missing pkg fails fast here with
// a "run `make engine:wasm`" message rather than a cryptic module-resolution error.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activeText, buildSampleSet, switchVariant } from '@shojiku/designer';
import { Editor, type SnippetValue } from '@shojiku/designer-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { alignOps } from '../canvas/align';
import { reorderContext, siblingRects, typeFitsOwner } from '../canvas/dnd';
import { planDrop } from '../canvas/dropPlan';
import { linkBadges } from '../canvas/linkBadge';
import { manipulationFor } from '../canvas/manipulate';
import { planMove } from '../canvas/planMove';
import { planResize } from '../canvas/planResize';
import { reparentOps } from '../canvas/reparent';
import { planReparent } from '../canvas/reparentTarget';
import { applyDefinitionOps, readDefinitionField, titleOp } from '../data/definitionsEdit';
import { fixFor } from '../diagnostics/fixModel';
import { type EngineTransport, TransportError } from '../engine/transport';
import { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';
import { composeDataUri } from '../image/dataUri';
import { sniffImage } from '../image/sniff';
import { blockNeverDraws, blockRefusedOwner } from '../insert/blockRefusal';
import { resolveContainerInsert } from '../insert/containerInsert';
import { containerShape, containerSnippet } from '../insert/containerModel';
import { insertTargetOwner } from '../insert/flowPlacement';
import { insertSnippet } from '../insert/insertSnippet';
import { resolveIterableTarget } from '../insert/iterableTarget';
import { SCAFFOLD_VARIANTS, scaffoldFromGroup, variantFitsBody } from '../insert/scaffold';
import { type ScaffoldField, scaffoldFromFields, scaffoldSchema } from '../insert/scaffoldFields';
import { scaffoldSnippet } from '../insert/scaffoldSnippet';
import { placeForTarget } from '../insert/targetPlacement';
import { wrapInContainerOps } from '../insert/wrap';
import { readBindings } from '../palette/bindings';
import { planInsertDrop } from '../palette/drag';
import { boundSnippet } from '../palette/dragSnippet';
import { readDefinitionsView } from '../palette/model';
import { buildUsage, fieldUsage } from '../palette/usage';
import { readBorder } from '../panel/borderModel';
import { edgeOps, presetOps } from '../panel/borderOps';
import { defaultStyleOp, INHERITED_STYLE_FIELDS } from '../panel/defaultsModel';
import { frameOf } from '../panel/frameModel';
import { gridColumnsPlan, gridRowsPlan } from '../panel/gridStructure';
import { registryNames } from '../panel/itemView';
import { containerLayoutFor } from '../panel/layoutModel';
import { directionOp, gapOp, ratioOp } from '../panel/layoutOps';
import { readMark } from '../panel/markModel';
import { setCheckedOps } from '../panel/markOps';
import { bindingPickOps } from '../panel/model';
import { paddingOps, readPadding } from '../panel/paddingModel';
import { PAGE_SIZES } from '../panel/pageSizes';
import { type PlacementGeometry, resolvePlacement } from '../panel/placementGeometry';
import { pinOps, placementFor, unpinOps } from '../panel/placementModel';
import { fillOrderOp, gridCountOp, gridGapOp, newPageOp } from '../panel/repeatGrid';
import { readShapeStyle, strokeWidthOp } from '../panel/shapeStyle';
import { deleteStyleOps, renameStyleOps } from '../panel/styleRefOps';
import { extendParams } from '../sample/generate';
import { buildStyleUsage } from '../styles/usage';
import { commitOps } from '../text/declCommit';
import { planChipInsert } from '../text/declMint';
import { buildTree, type TreeNode } from '../tree/model';
import { rowDropOps } from '../tree/rowDrag';

// src/integration/ -> repo root is four levels up.
const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);

/** The full `engine/wasm` Engine surface this test drives (the transport uses
 * only the `WasmEngine` subset; locale/font injection needs the rest). */
interface FullEngine extends WasmEngine {
  setLocale(id: string, overlay?: string | null): void;
  fontPacksNeeded(): string;
  fontFilesNeeded(packId: string): string;
  addFontPack(id: string, manifest: string): void;
  addFontFile(packId: string, file: string, bytes: Uint8Array): void;
  loadFonts(): void;
}

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: new () => FullEngine;
}

const fontFile = (packId: string, name: string) =>
  fileURLToPath(new URL(`packs/fonts/${packId}/${name}`, REPO));
const exampleFile = (name: string) =>
  fileURLToPath(new URL(`examples/business/receipt-us/${name}`, REPO));

async function loadModule(): Promise<WasmModule> {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error('engine/wasm/pkg is missing — run `make engine:wasm` before the gui gates');
  }
  const mod = (await import(PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
  return mod;
}

/** A locale-set, fonts-loaded engine — the "prepared" instance the transport
 * expects (matching how a browser host wires it up). */
function preparedEngine(mod: WasmModule): FullEngine {
  const engine = new mod.Engine();
  engine.setLocale('en-US', null);
  const packs = JSON.parse(engine.fontPacksNeeded()) as string[];
  for (const packId of packs) {
    engine.addFontPack(packId, readFileSync(fontFile(packId, 'manifest.yml'), 'utf8'));
    const files = JSON.parse(engine.fontFilesNeeded(packId)) as string[];
    for (const file of files) {
      engine.addFontFile(packId, file, readFileSync(fontFile(packId, file)));
    }
  }
  engine.loadFonts();
  return engine;
}

let wasmModule: WasmModule;
let transport: EngineTransport;
const template = () => readFileSync(exampleFile('templates.yml'), 'utf8');
const params = () => readFileSync(exampleFile('params.json'), 'utf8');
const definitions = () => readFileSync(exampleFile('definitions.yml'), 'utf8');

beforeAll(async () => {
  wasmModule = await loadModule();
  transport = createWasmTransport(preparedEngine(wasmModule));
});

const localePack = (id: string) =>
  readFileSync(fileURLToPath(new URL(`packs/locale/${id}.yml`, REPO)), 'utf8');

describe('locale facts against the real engine', () => {
  // The evidence that retiring the Designer's hand-copied sample table did not
  // just move the copy: these strings are the ENGINE's, produced by the same
  // dispatch a bound field takes. The session here is prepared for en-US, so
  // every case also proves the query answers for a locale the preview is NOT
  // rendering through — which is the ordinary case for this panel.
  const doc = 'sections:\n  body:\n    type: flow\n    items: []\n';

  it('answers for the session locale', async () => {
    const facts = await transport.localeFacts?.(doc, 'en-US');
    expect(facts?.id).toBe('en-US');
    expect(facts?.currencyDefault).toBe('USD');
    expect(facts?.date).toBe('Nov 3, 2026');
  });

  it('answers for a BUILTIN the session is not using', async () => {
    const facts = await transport.localeFacts?.(doc, 'ja-JP');
    expect(facts?.id).toBe('ja-JP');
    expect(facts?.currencyDefault).toBe('JPY');
    // JPY has no fraction digits where the session's USD has two.
    expect(facts?.amount).toBe('1,234,568');
  });

  it('reports the Buddhist year for a PACK locale the host supplies', async () => {
    // The sharpest of the two claims the deleted drift-guard made, now proven
    // end to end: th-TH's pack carries an era table, so 2026 CE prints 2569.
    const facts = await transport.localeFacts?.(doc, 'th-TH', localePack('th-th'));
    expect(facts?.id).toBe('th-TH');
    expect(facts?.date).toContain('2569');
    expect(facts?.currencyDefault).toBe('THB');
  });

  it('groups the Indian way for hi-IN, and in threes for the rest', async () => {
    // The other claim: a four-digit sample would read identically for both.
    const hi = await transport.localeFacts?.(doc, 'hi-IN', localePack('hi-in'));
    expect(hi?.number).toBe('1,23,45,678.9');
    const en = await transport.localeFacts?.(doc, 'en-US');
    expect(en?.number).toBe('12,345,678.9');
  });

  it('follows the DOCUMENT’s own currency', async () => {
    const withJpy = `defaults:\n  currency: JPY\n${doc}`;
    const facts = await transport.localeFacts?.(withJpy, 'en-US');
    expect(facts?.currencyDefault).toBe('USD');
    expect(facts?.amount).toBe('1,234,568');
  });

  it('refuses a locale the host supplied no pack for', async () => {
    await expect(transport.localeFacts?.(doc, 'zz-ZZ')).rejects.toBeInstanceOf(TransportError);
    await expect(transport.localeFacts?.(doc, 'zz-ZZ')).rejects.toMatchObject({
      code: 'locale_error',
    });
  });
});

describe('the link flag, engine to badge, through the real wasm', () => {
  // The JOIN. The engine's own e2e proves layout STAMPS `linked`, and
  // `linkBadge.test.ts` proves the canvas turns a stamped box into a badge —
  // but both halves work off fixtures they wrote themselves, so until this
  // case existed NO gate executed the seam. (Measured at review time: this
  // file reads a real-wasm box field 41 times and `linked` zero of them.)
  const page = (items: string) =>
    `page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 400, h: 200 }\n    items:\n${items}`;

  const boxesOf = async (yaml: string) => {
    const outcome = await transport.renderRaw(yaml, '{}', undefined, { scale: 1 });
    expect(outcome.ok).toBe(true);
    return {
      boxes: outcome.inspect?.boxes.pages.flat() ?? [],
      diagnostics: outcome.diagnostics.items,
    };
  };

  it('carries a real link all the way to a drawn badge', async () => {
    const { boxes, diagnostics } = await boxesOf(
      page(
        '      - type: text\n        id: cta\n        text: shop\n        link: { url: "https://example.com" }\n      - type: text\n        id: plain\n        text: no link\n',
      ),
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const cta = boxes.find((b) => b.id === 'cta');
    const plain = boxes.find((b) => b.id === 'plain');
    // The engine really produced the field (not a fixture we wrote).
    expect(cta?.linked).toBe(true);
    expect(plain?.linked).not.toBe(true);
    // …and the canvas model really turns it into exactly one badge, anchored
    // to the ink the same engine measured.
    const badges = linkBadges(boxes, 2);
    expect(badges).toHaveLength(1);
    expect(badges[0].path).toBe(cta?.path);
    expect(Number.isFinite(badges[0].cx)).toBe(true);
    expect(badges[0].cx).toBeGreaterThan((cta?.border.x ?? 0) * 2);
  });

  it('does NOT mark a URL the engine refused, and says why', async () => {
    // The security property, end to end: a badge here would promise the
    // author a link the PDF will not carry.
    const { boxes, diagnostics } = await boxesOf(
      page(
        '      - type: text\n        id: bad\n        text: nope\n        link: { url: "javascript:alert(1)" }\n',
      ),
    );
    expect(boxes.find((b) => b.id === 'bad')?.linked).not.toBe(true);
    expect(linkBadges(boxes, 2)).toHaveLength(0);
    expect(diagnostics.map((d) => d.code)).toContain('unsupported_link_scheme');
  });
});

describe('wasm transport against the real engine (receipt-us)', () => {
  it('renders raw pages with a matching RGBA buffer and a path-addressed box index', async () => {
    const outcome = await transport.renderRaw(template(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.pages.length).toBeGreaterThan(0);
    const page = outcome.pages[0];
    expect(page.rgba.length).toBe(page.width * page.height * 4);
    expect(outcome.inspect).not.toBeNull();
    const boxes = outcome.inspect?.boxes.pages[0] ?? [];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes[0].path).toMatch(/^sections\./);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('renders a single page when a page index is given', async () => {
    const outcome = await transport.renderRaw(template(), params(), definitions(), {
      scale: 2,
      pageIndex: 0,
    });
    expect(outcome.pages).toHaveLength(1);
  });

  it('asks the real engine for the format catalog, probes included', async () => {
    // The seam's OTHER half. Host Rust gates never compile the shim
    // (`cfg(target_arch = "wasm32")`), so nothing but a real call proves the
    // binding marshals: the probe list crosses as JSON into a camelCase
    // `deny_unknown_fields` struct, and a rename on either side would leave
    // every gate green while the pattern preview threw on the first keystroke.
    const ask = transport.formatCatalog;
    expect(ask).toBeDefined();
    const catalog = await ask?.(template(), [{ fieldType: 'date', pattern: 'yyyy' }]);
    // The types come back described and RENDERED — the whole reason the
    // Designer asks the engine instead of keeping a sample table by hand.
    const date = catalog?.types.find((t) => t.fieldType === 'date');
    expect(date?.variants.length).toBeGreaterThan(0);
    expect(date?.variants[0].samples[0]).not.toBe('');
    // The probe survived the crossing and was rendered, not refused.
    expect(catalog?.probes).toHaveLength(1);
    expect(catalog?.probes[0].refused).toBeNull();
    expect(catalog?.probes[0].sample).toMatch(/^\d{4}$/);
  });

  it('brings a REFUSAL across the seam under its own spelling', async () => {
    // The half the case above cannot prove. The panel's refusal branch turns on
    // one string surviving this crossing: `ProbeRefusal::PatternTooLong` has to
    // serialize as exactly `patternTooLong` and be admitted by the closed
    // `REFUSALS` set in `engine/formatCatalogResponse.ts`. A rename on either
    // side leaves the Rust enum test, the hand-written JSON fixture and all
    // eleven `PatternField` unit tests green, while `asMember` throws,
    // `toFormatCatalog` rejects, `useFormatCatalog`'s probe swallows it into
    // `[]`, and the surface silently falls back to the empty-pattern prompt —
    // which is precisely the bug the refusal branch exists to remove.
    const ask = transport.formatCatalog;
    // One character past `MAX_PROBE_PATTERN` (256, `engine/authoring/src/formats.rs`),
    // counted in CHARS by the engine. Well under the shim's own probe-count cap.
    const catalog = await ask?.(template(), [{ fieldType: 'date', pattern: 'y'.repeat(257) }]);
    expect(catalog?.probes).toHaveLength(1);
    expect(catalog?.probes[0].refused).toBe('patternTooLong');
    // Refused means NOT rendered — the empty sample is what made this
    // indistinguishable from an unwritten pattern in the first place.
    expect(catalog?.probes[0].sample).toBe('');
  });

  it('validate returns a diagnostics envelope', async () => {
    const diagnostics = await transport.validate(template(), params(), definitions());
    expect(Array.isArray(diagnostics.items)).toBe(true);
  });

  it('surfaces a parse error as ok:false diagnostics, never a throw', async () => {
    const outcome = await transport.renderRaw('version: [1, 2\n', params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.pages).toHaveLength(0);
    expect(outcome.diagnostics.items.some((d) => d.code === 'parse_error')).toBe(true);
  });

  it('refuses containers nested past the cap on the container itself, as a diagnostic', async () => {
    // Refused while the engine reads the document, before validation runs,
    // yet under validation's own code, argument and path — which is what
    // lets the panel point at the container that went one level too deep.
    let item = '{ type: text, text: deep }';
    for (let i = 0; i < 61; i++) {
      item = `{ type: container, items: [ ${item} ] }`;
    }
    const deep = `sections:\n  body:\n    type: flow\n    items: [ ${item} ]\n`;
    const outcome = await transport.renderRaw(deep, params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.items.map((d) => d.code)).toEqual(['container_depth_exceeded']);
    const [refusal] = outcome.diagnostics.items;
    expect(refusal.path).toBe(`sections.body.items[0]${'.items[0]'.repeat(32)}`);
    expect(refusal.args).toEqual({ max: 32 });
    const again = await transport.validate(template(), params(), definitions());
    expect(Array.isArray(again.items)).toBe(true);
  });

  it('rejects with a TransportError when rendering before fonts are loaded', async () => {
    const bare = new wasmModule.Engine();
    bare.setLocale('en-US', null);
    const bareTransport = createWasmTransport(bare);
    await expect(
      bareTransport.renderRaw(template(), params(), definitions(), { scale: 2 }),
    ).rejects.toBeInstanceOf(TransportError);
  });

  it('renders a different page against a switched sample variant', async () => {
    // The variant switcher feeds the ACTIVE variant's params to the engine, so
    // two variants of the same template must produce two different renders —
    // the whole point of the feature (`does this data change the layout?`).
    const alt = params().replace('SHOJIKU MART', 'OTHER STORE NAME');
    expect(alt).not.toBe(params());
    const set = buildSampleSet(params(), [{ id: 'alt', name: { en: 'Alt' }, text: alt }]);
    const first = await transport.renderRaw(template(), activeText(set), definitions(), {
      scale: 2,
    });
    const switched = await transport.renderRaw(
      template(),
      activeText(switchVariant(set, 'alt')),
      definitions(),
      { scale: 2 },
    );
    expect(first.ok && switched.ok).toBe(true);
    // Same geometry, different pixels: the changed store name repaints page 0.
    expect(switched.pages[0].rgba).not.toEqual(first.pages[0].rgba);
  });
});

// The data-item editor's definition edits reach the SAME validate the render
// path uses — real-engine proof that editing `definitions.yml` in the Designer
// behaves like editing the file on disk. `store.name` is a bound field
// (`data: { key: store.name }`), so removing its declaration is observable.
describe('definition edits reach the engine validate (receipt-us)', () => {
  const namePath = ['properties', 'store', 'properties', 'name'];

  it('a title edit round-trips CST-preserving and still validates clean', async () => {
    const before = readDefinitionField(definitions(), namePath);
    const op = titleOp(namePath, before.title, 'Shop name');
    expect(op).not.toBeNull();
    const edited = applyDefinitionOps(definitions(), op === null ? [] : [op]);
    expect(edited).toContain('title: Shop name');
    // An untouched sibling survives byte-for-byte (CST preservation).
    expect(edited).toContain('example: SHOJIKU MART');
    const diags = await transport.validate(template(), params(), edited);
    expect(diags.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('removing a bound field surfaces it as an unknown data key at validate', async () => {
    const edited = applyDefinitionOps(definitions(), [{ op: 'removeKey', keys: namePath }]);
    const diags = await transport.validate(template(), params(), edited);
    expect(
      diags.items.some((d) => d.code === 'unknown_data_key' && d.message.includes('store.name')),
    ).toBe(true);
  });
});

// The edit loop end to end against the REAL engine: a designer-core `Editor`
// applies a named op, and the edited YAML re-renders + re-validates through the
// same transport the canvas uses — the parity evidence that a panel edit and
// `shojiku render` see the same document.
describe('editor edit -> engine re-render (receipt-us)', () => {
  it('applies a real op to a real item and re-renders without new errors', async () => {
    const first = await transport.renderRaw(template(), params(), definitions(), { scale: 2 });
    const path = first.inspect?.boxes.pages[0]?.[0]?.path;
    expect(path).toBeDefined();

    const editor = Editor.create(template());
    const result = editor.apply({
      op: 'setScalar',
      path: path as string,
      keys: ['style', 'color'],
      value: '#112233',
    });
    expect(result.ok).toBe(true);
    const edited = editor.text();
    expect(edited).toContain('#112233');

    const outcome = await transport.renderRaw(edited, params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const revalidated = await transport.validate(edited, params(), definitions());
    expect(revalidated.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('inserts a default text snippet, re-renders with its box, then removes it again', async () => {
    const editor = Editor.create(template());
    const before = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    // Count across ALL pages — an appended flow item may spill to a new page.
    const beforeBoxes = before.inspect?.boxes.pages.flat().length ?? 0;
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;

    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: bodyLength,
      value: { type: 'text', text: 'inserted probe' },
    });
    expect(inserted.ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(`sections.body.items[${bodyLength}]`);
    expect(outcome.inspect?.boxes.pages.flat()).toHaveLength(beforeBoxes + 1);

    const removed = editor.apply({
      op: 'removeItem',
      path: 'sections.body.items',
      index: bodyLength,
    });
    expect(removed.ok).toBe(true);
    const reverted = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(reverted.inspect?.boxes.pages.flat()).toHaveLength(beforeBoxes);
  });

  it('inserts both FORM MARKS and renders them WARNING-clean, with the checkbox auto-sized', async () => {
    // The area posture: every insert snippet renders diagnostics-free AND
    // visibly. Both halves matter here and neither is provable in jsdom — an
    // unanchored ellipse with no positive `w`/`h` is SKIPPED with
    // `mark_missing_size`, and the checkbox authors no box at all, so only the
    // real engine can say whether the cap-height default actually reserved one.
    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const ellipsePath = `sections.body.items[${bodyLength}]`;
    const checkboxPath = `sections.body.items[${bodyLength + 1}]`;
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength,
        value: insertSnippet('ellipse', ''),
      }).ok,
    ).toBe(true);
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength + 1,
        value: insertSnippet('checkbox', ''),
      }).ok,
    ).toBe(true);

    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    // WARNING-clean, not just error-free: a blank insert must not bait live
    // diagnostics.
    expect(outcome.diagnostics.items).toHaveLength(0);
    const boxes = outcome.inspect?.boxes.pages.flat() ?? [];
    const ellipse = boxes.find((box) => box.path === ellipsePath);
    const checkbox = boxes.find((box) => box.path === checkboxPath);
    // VISIBLY: each reserved a positive box. The checkbox's is the engine's
    // cap-height square — the whole reason its snippet authors no size.
    expect(ellipse?.border.w).toBe(60);
    expect(ellipse?.border.h).toBe(40);
    expect(checkbox?.border.w ?? 0).toBeGreaterThan(0);
    expect(checkbox?.border.h ?? 0).toBeGreaterThan(0);

    // The panel reads them back exactly, and its ops round-trip through the
    // engine: ticking the checkbox and stroking the ellipse stay clean.
    const readFn = (path: string) => editor.read(path);
    expect(readMark(readFn, checkboxPath).mode).toBe('static');
    expect(readShapeStyle(readFn, ellipsePath).strokeWidth).toBe('');
    expect(editor.applyAll(setCheckedOps(checkboxPath, true, false)).ok).toBe(true);
    const widthOp = strokeWidthOp(ellipsePath, '2.5');
    expect(widthOp).not.toBeNull();
    expect(editor.applyAll([widthOp as NonNullable<typeof widthOp>]).ok).toBe(true);
    const edited = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(edited.ok).toBe(true);
    expect(edited.diagnostics.items).toHaveLength(0);
    expect(readShapeStyle((path: string) => editor.read(path), ellipsePath).strokeWidth).toBe(
      '2.5',
    );
  });

  it('inserts a container-picker scaffold, renders it WARNING-clean with its slot boxes, edits its layout', async () => {
    // The three picker shapes were probed against the CLI engine at plan time
    // (diagnostics-empty + visibly correct); this pins the same claim on the
    // wasm path with the exact snippet the picker builds, then drives the
    // 子の並べ方 ops (direction / gap / ratio) over the inserted scaffold.
    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const shape = containerShape(3, 1);
    expect(shape).not.toBeNull();
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: bodyLength,
      value: containerSnippet(shape as NonNullable<typeof shape>, 'Slot'),
    });
    expect(inserted.ok).toBe(true);
    const containerPath = `sections.body.items[${bodyLength}]`;

    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    // WARNING-clean, not just error-free: the scaffold must not bait live
    // diagnostics on a blank insert.
    expect(outcome.diagnostics.items).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(containerPath);
    for (let i = 0; i < 3; i += 1) {
      expect(paths).toContain(`${containerPath}.items[${i}]`);
    }

    // The panel's layout view reads the scaffold back exactly.
    const readFn = (path: string) => editor.read(path);
    const layout = containerLayoutFor(readFn, containerPath);
    expect(layout).toMatchObject({ mode: 'row', gap: '8', alignItems: 'stretch' });
    expect(layout?.children).toHaveLength(3);

    // Direction toggle + gap + ratio: each ONE op, all engine-clean after.
    expect(editor.apply(directionOp(containerPath, 'column')).ok).toBe(true);
    const gap = gapOp(containerPath, '12');
    expect(gap).not.toBeNull();
    expect(editor.apply(gap as NonNullable<typeof gap>).ok).toBe(true);
    const ratio = ratioOp(`${containerPath}.items[0]`, '2');
    expect(ratio).not.toBeNull();
    expect(editor.apply(ratio as NonNullable<typeof ratio>).ok).toBe(true);
    expect(containerLayoutFor(readFn, containerPath)).toMatchObject({
      mode: 'column',
      gap: '12',
    });
    const edited = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(edited.ok).toBe(true);
    expect(edited.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('nest-into-slot, grid 列/行 plans, and コンテナにまとめる all render WARNING-clean', async () => {
    // The container-structure batches (slot replace / column re-chunk / row
    // append / wrap-in-place) drive real ops over a real document, and the
    // result must not bait live diagnostics — the same claim the picker
    // scaffold pins, extended to the structure edits built on it.
    const editor = Editor.create(template());
    const readFn = (path: string) => editor.read(path);
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const gridShape = containerShape(2, 2);
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength,
        value: containerSnippet(gridShape as NonNullable<typeof gridShape>, 'Slot'),
      }).ok,
    ).toBe(true);
    const gridPath = `sections.body.items[${bodyLength}]`;

    // 列 +1: pads each row with placeholders and rewrites columns — one batch.
    const colsPlan = gridColumnsPlan(readFn, gridPath, 3, 'Slot');
    expect(colsPlan.drops).toBe(false);
    expect(editor.applyAll(colsPlan.ops).ok).toBe(true);
    expect((editor.read(`${gridPath}.items`) as unknown[]).length).toBe(6);
    // 行 +1: appends a placeholder row, no box.rows key authored.
    const rowsPlan = gridRowsPlan(readFn, gridPath, 3, 'Slot');
    expect(editor.applyAll(rowsPlan.ops).ok).toBe(true);
    expect((editor.read(`${gridPath}.items`) as unknown[]).length).toBe(9);
    expect(editor.read(`${gridPath}.box.rows`)).toBeUndefined();

    // Nest-into-slot: the first cell is an untouched placeholder — replace it
    // with a 2×1 row scaffold in ONE batch.
    const dest = resolveContainerInsert(readFn, `${gridPath}.items[0]`, 'Slot');
    expect(dest.mode).toBe('nest');
    const nest = dest as Extract<typeof dest, { mode: 'nest' }>;
    const rowShape = containerShape(2, 1);
    expect(
      editor.applyAll([
        {
          op: 'insertItem',
          path: nest.path,
          index: nest.index,
          value: containerSnippet(rowShape as NonNullable<typeof rowShape>, 'Slot'),
        },
        { op: 'removeItem', path: nest.path, index: nest.index + 1 },
      ]).ok,
    ).toBe(true);

    // まとめる: insert a fresh leaf and wrap it in a column container in place.
    const wrapPath = `sections.body.items[${bodyLength + 1}]`;
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength + 1,
        value: { type: 'text', text: 'wrapped leaf' },
      }).ok,
    ).toBe(true);
    const wrapOps = wrapInContainerOps(readFn, wrapPath);
    expect(wrapOps).not.toBeNull();
    expect(editor.applyAll(wrapOps as NonNullable<typeof wrapOps>).ok).toBe(true);

    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    // The nested row scaffold laid out inside the grid cell, and the wrapped
    // item laid out inside its new container.
    expect(paths).toContain(`${gridPath}.items[0].items[0]`);
    expect(paths).toContain(`${wrapPath}.items[0]`);
  });

  it('renders a chip-committed interpolation text cleanly (the wire the chip editor writes)', async () => {
    // The chip editor serializes a picked field back to `{key}` wire text —
    // prove that exact spelling is engine-valid interpolation against a real
    // params key: no errors, and no missing-data/format degradation either.
    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: bodyLength,
      value: { type: 'text', text: 'Served by {sale.cashier} at {store.name}' },
    });
    expect(inserted.ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(
      outcome.diagnostics.items.filter(
        (d) => d.code === 'missing_data' || d.code === 'format_error',
      ),
    ).toHaveLength(0);
  });

  // A valid 1×1 RGB PNG (CRC-correct chunks) the engine decodes.
  const PNG_1X1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM45KAFAAL0AS1AMrjaAAAAAElFTkSuQmCC';

  it('inserts an image from a pipeline-composed PNG data URI and renders it error-free', async () => {
    const bytes = new Uint8Array(Buffer.from(PNG_1X1, 'base64'));
    // The import pipeline's own sniff + data-URI composition (not a mock).
    expect(sniffImage(bytes)).toBe('png');
    const src = composeDataUri('png', bytes);

    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: bodyLength,
      value: { type: 'image', box: { w: 40, h: 40 }, src },
    });
    expect(inserted.ok).toBe(true);

    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(`sections.body.items[${bodyLength}]`);
  });

  it('inserts an image from a pipeline-composed SVG data URI and renders it error-free', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c2402a"/></svg>';
    const bytes = new TextEncoder().encode(svg);
    expect(sniffImage(bytes)).toBe('svg');
    const src = composeDataUri('svg', bytes);

    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: bodyLength,
      value: { type: 'image', box: { w: 40, h: 40 }, src },
    });
    expect(inserted.ok).toBe(true);

    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(`sections.body.items[${bodyLength}]`);
  });

  it('drops a palette field through the drag model: a bound item renders with live data', async () => {
    const editor = Editor.create(template());
    const first = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    const pageBoxes = first.inspect?.boxes.pages[0] ?? [];
    // Plan the drop over REAL inspect geometry: below the first item's
    // midpoint, before the second.
    const siblings = siblingRects(pageBoxes, 'sections.body.items');
    const firstRect = siblings?.find((s) => s.index === 0)?.rect;
    if (firstRect == null) throw new Error('sibling geometry missing');
    const plan = planInsertDrop((path) => editor.read(path), pageBoxes, {
      x: firstRect.x + 1,
      y: firstRect.y + firstRect.h - 1,
    });
    expect(plan.line).not.toBeNull();
    // Bind a REAL definitions field (store.address exists in params too).
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: plan.index,
      value: boundSnippet({ key: 'store.address', type: 'string', label: 'Address', group: null }),
    });
    expect(inserted.ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    // No errors AND no binding warnings — the key resolves against params.
    expect(
      outcome.diagnostics.items.filter(
        (d) => d.severity === 'error' || d.code === 'missing_data' || d.code === 'unknown_data_key',
      ),
    ).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(`sections.body.items[${plan.index}]`);
    // The palette usage walk sees the new binding (picker and palette agree).
    const groups = readDefinitionsView(definitions());
    const usage = buildUsage(readBindings(editor.text()));
    const storeGroup = groups?.find((g) => g.id === 'store');
    if (storeGroup == null) throw new Error('store group missing');
    expect(fieldUsage(usage, storeGroup, 'store.address')).toContain(
      `sections.body.items[${plan.index}]`,
    );

    // An image-field drop creates a data-bound image item; with no image
    // value in params it degrades to the missing_data warning, never an
    // error and never a crash.
    const imageInserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: boundSnippet({ key: 'store.logo', type: 'image', label: 'Logo', group: null }),
    });
    expect(imageInserted.ok).toBe(true);
    const withImage = await transport.renderRaw(editor.text(), params(), undefined, {
      scale: 2,
    });
    expect(withImage.ok).toBe(true);
    expect(withImage.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('binds a table cell to a DOCUMENT-scope key and renders it on every row', async () => {
    // The escape this feature exists for: a value that belongs to the whole
    // document, printed inside a row-scoped sub-template. Authored the way
    // the GUI authors it (a picker's ops, then the palette drop's snippet),
    // then proven against the real engine.
    const editor = Editor.create(template());
    // Find the bundled example's table rather than pinning its index — the
    // example is free to gain a sibling.
    const bodyItems = editor.read('sections.body.items') as readonly { type?: string }[];
    const tableIndex = bodyItems.findIndex((item) => item?.type === 'table');
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    const table = `sections.body.items[${tableIndex}]`;

    // Give the first column a `cell:` sub-template holding one bound text
    // item, then re-point that binding at a document-scope key through the
    // picker's own op builder.
    const cellItem = `${table}.columns[0].cell.items[0]`;
    expect(
      editor.applyAll([
        {
          op: 'putValue',
          path: `${table}.columns[0]`,
          keys: ['cell'],
          value: { items: [{ type: 'text', data: { key: 'name' } }] },
        },
        // A column renders `data` OR `cell`, never both — the engine reports
        // `column_content_conflict` otherwise (which is why the panel hides a
        // cell column's binding editor).
        { op: 'removeKey', path: `${table}.columns[0]`, keys: ['data'] },
      ]).ok,
    ).toBe(true);
    const read = (path: string) => editor.read(path);
    expect(editor.applyAll(bindingPickOps(read, cellItem, 'store.address', true)).ok).toBe(true);
    expect(editor.text()).toContain('scope: document');

    // And the drop path: a document field dropped into the same cell.
    const dropped = editor.apply({
      op: 'insertItem',
      path: `${table}.columns[0].cell.items`,
      index: 1,
      value: boundSnippet(
        { key: 'store.phone', type: 'string', label: 'Phone', group: null },
        false,
        true,
      ),
    });
    expect(dropped.ok).toBe(true);

    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    // The escape resolves: no binding warnings, no errors. (An element-scoped
    // `store.address` inside a row would report `unknown_data_key` here.)
    expect(
      outcome.diagnostics.items.filter(
        (d) => d.severity === 'error' || d.code === 'missing_data' || d.code === 'unknown_data_key',
      ),
    ).toHaveLength(0);
    // It laid out once per row — the sub-template is drawn per element.
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths.filter((path) => path === cellItem).length).toBeGreaterThan(1);
    // Validate agrees.
    const diagnostics = await transport.validate(editor.text(), params(), definitions());
    expect(diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    // And the usage walk files it at DOCUMENT scope, not under the row group.
    const usage = buildUsage(readBindings(editor.text()));
    expect(usage.scalar.get('store.address')).toContain(cellItem);
    expect(usage.rows.get('items')?.get('store.address')).toBeUndefined();
  });

  it('builds a layer tree whose paths address the same nodes as the engine box index', async () => {
    const view = buildTree(template());
    expect(view).not.toBeNull();
    expect(view?.truncated).toBe(false);
    const treePaths = new Set<string>();
    const collect = (nodes: readonly TreeNode[]): void => {
      for (const node of nodes) {
        treePaths.add(node.path);
        collect(node.children);
      }
    };
    collect(view?.roots ?? []);

    const outcome = await transport.renderRaw(template(), params(), definitions(), { scale: 2 });
    const boxPaths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(boxPaths.length).toBeGreaterThan(0);
    // Every top-level body item the engine placed is addressable in the tree
    // by the SAME path string — the grammar-identity claim behind the shared
    // selection (deeper box paths like generated table rows may not be
    // authored nodes, so the pin is on the authored item level).
    const itemPaths = boxPaths.filter((path) => /^sections\.\w+\.items\[\d+\]$/.test(path));
    expect(itemPaths.length).toBeGreaterThan(0);
    for (const path of itemPaths) {
      expect(treePaths.has(path)).toBe(true);
    }
  });

  it('reorders body items via moveItem and re-renders cleanly', async () => {
    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    expect(bodyLength).toBeGreaterThan(1);
    const moved = editor.apply({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: bodyLength - 1,
    });
    expect(moved.ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('drag-reorders through the canvas dnd model against real inspect geometry', async () => {
    const editor = Editor.create(template());
    const first = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    const pageBoxes = first.inspect?.boxes.pages[0] ?? [];
    // The flow body's first item is draggable (flow, no authored box.x/y)…
    const context = reorderContext((path) => editor.read(path), 'sections.body.items[0]');
    expect(context).toEqual({ parent: 'sections.body.items', from: 0, axis: 'y' });
    // …and a drop below the second item's midpoint plans the one moveItem.
    const siblings = siblingRects(pageBoxes, 'sections.body.items');
    expect(siblings).not.toBeNull();
    const second = siblings?.find((s) => s.index === 1)?.rect;
    if (second === undefined) throw new Error('sibling geometry missing');
    const plan = planDrop(
      (path) => reorderContext((p) => editor.read(p), path),
      pageBoxes,
      'sections.body.items[0]',
      { x: second.x + second.w / 2, y: second.y + second.h - 1 },
    );
    expect(plan?.op).toEqual({ op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 });
    if (plan?.op == null) throw new Error('plan missing');
    expect(editor.apply(plan.op).ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    // The moved item's authored id now lays out at the destination path.
    const movedBox = outcome.inspect?.boxes.pages[0]?.find((b) => b.id === 'store_name');
    expect(movedBox?.path).toBe('sections.body.items[1]');
  });

  it('reparents into a container through the shared model against real geometry', async () => {
    const doc = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        id: loose',
      '        text: loose',
      '      - type: container',
      '        id: shelf',
      '        box: { direction: column }',
      '        items:',
      '          - type: text',
      '            text: inside',
      '',
    ].join('\n');
    const editor = Editor.create(doc);
    const read = (path: string) => editor.read(path);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const pageBoxes = before.inspect?.boxes.pages[0] ?? [];
    const shelf = pageBoxes.find((b) => b.id === 'shelf');
    if (shelf === undefined) throw new Error('container box missing');
    // Aim at the real container's own rect — the whole point is that the
    // owner-under-pointer rule is asked over geometry the ENGINE produced.
    const plan = planReparent(
      read,
      pageBoxes,
      { x: shelf.border.x + shelf.border.w / 2, y: shelf.border.y + shelf.border.h - 1 },
      { width: before.pages[0].width / 2, height: before.pages[0].height / 2 },
      before.inspect?.margin ?? null,
    );
    expect(plan?.target.receiver.items).toBe('sections.body.items[1].items');
    if (plan == null) throw new Error('plan missing');
    const ops = reparentOps(
      read,
      'sections.body.items[0]',
      plan.target,
      before.inspect?.margin ?? null,
    );
    if (ops === null) throw new Error('ops missing');
    expect(editor.applyAll(ops).ok).toBe(true);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    // The engine now lays the moved item out INSIDE the container's box.
    const moved = after.inspect?.boxes.pages[0]?.find((b) => b.id === 'loose');
    const shelfAfter = after.inspect?.boxes.pages[0]?.find((b) => b.id === 'shelf');
    if (moved === undefined || shelfAfter === undefined) throw new Error('boxes missing');
    expect(moved.path.startsWith('sections.body.items[0].items[')).toBe(true);
    expect(moved.border.y).toBeGreaterThanOrEqual(shelfAfter.border.y);
    expect(moved.border.y + moved.border.h).toBeLessThanOrEqual(
      shelfAfter.border.y + shelfAfter.border.h + 0.01,
    );
  });

  it('writes band coordinates against the engine own resolved margin box', async () => {
    const doc = [
      'version: 0.1.0',
      'page: { size: A4, margin: 25 }',
      'sections:',
      '  header:',
      '    height: 60',
      '    items:',
      '      - type: text',
      '        id: banner',
      '        text: banner',
      '        box: { x: 0, y: 0, w: 200, h: 14 }',
      '  body:',
      '    type: flow',
      '    box: { x: 0, y: 70, w: "100%", h: 600 }',
      '    items:',
      '      - type: text',
      '        id: loose',
      '        text: loose',
      '',
    ].join('\n');
    const editor = Editor.create(doc);
    const read = (path: string) => editor.read(path);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const margin = before.inspect?.margin ?? null;
    if (margin === null) throw new Error('margin missing');
    // D5: a band child and an absolute-body child author against the MARGIN
    // box, which is a claim about `engine/layout`'s own page basis — pinned
    // here rather than only in a hand-written fixture.
    const page = { width: before.pages[0].width / 2, height: before.pages[0].height / 2 };
    const drop = { x: margin[3] + 40, y: margin[0] + 20 };
    const plan = planReparent(read, before.inspect?.boxes.pages[0] ?? [], drop, page, margin);
    expect(plan?.target.receiver.items).toBe('sections.header.items');
    if (plan == null) throw new Error('plan missing');
    const ops = reparentOps(read, 'sections.body.items[0]', plan.target, margin);
    expect(ops).toContainEqual({
      op: 'setScalar',
      path: 'sections.body.items[0]',
      keys: ['box', 'x'],
      value: 40,
    });
    expect(ops).toContainEqual({
      op: 'setScalar',
      path: 'sections.body.items[0]',
      keys: ['box', 'y'],
      value: 20,
    });
    if (ops === null) throw new Error('ops missing');
    expect(editor.applyAll(ops).ok).toBe(true);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    // The engine lays it out exactly where the drop point was.
    const moved = after.inspect?.boxes.pages[0]?.find((b) => b.id === 'loose');
    expect(moved?.border.x).toBeCloseTo(drop.x, 5);
    expect(moved?.border.y).toBeCloseTo(drop.y, 5);
  });

  it('band-places an insert so the engine draws it at the foot of the margin box', async () => {
    // placeForTarget measures the margin box from the DOCUMENT when there is no
    // render yet; the engine then has to lay the item out where a footer prints:
    // a fixed-height item bottom-aligned, an auto-height container near the foot
    // (not at the top of the page, where a box-less band child falls).
    const doc = [
      'version: 0.1.0',
      'page: { size: A4, margin: 25 }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      '  footer:',
      '    repeat: every_page',
      '    items: []',
      '',
    ].join('\n');
    const editor = Editor.create(doc);
    const read = (path: string) => editor.read(path);
    const path = 'sections.footer.items';
    const rect = { type: 'rect', id: 'r', box: { w: 120, h: 60 }, style: { borderWidth: 1 } };
    const container = { type: 'container', id: 'c', items: [{ type: 'text', text: 'x' }] };
    for (const [index, node] of [rect, container].entries()) {
      const value = placeForTarget(read, null, path, node as SnippetValue);
      expect(editor.apply({ op: 'insertItem', path, index, value }).ok).toBe(true);
    }
    const outcome = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const margin = outcome.inspect?.margin;
    if (margin == null) throw new Error('margin missing');
    // The page's pixel height is ceil-rounded and the placement floors the
    // document's margin box, so the exact bottom sits within 2pt ABOVE this.
    const bottom = outcome.pages[0].height / 2 - margin[2];
    const boxes = outcome.inspect?.boxes.pages[0] ?? [];
    const r = boxes.find((b) => b.id === 'r');
    const c = boxes.find((b) => b.id === 'c');
    if (r == null || c == null) throw new Error('band boxes missing');
    expect(r.border.y + r.border.h).toBeLessThanOrEqual(bottom);
    expect(r.border.y + r.border.h).toBeGreaterThanOrEqual(bottom - 2);
    expect(c.border.y).toBeGreaterThan(bottom - 40);
  });

  it('lands a layer-tree drop into a footer where the footer prints', async () => {
    // The tree has no drop point; a box-less row dropped on the footer row gets
    // the insert rule's coordinates, and the engine then has to draw it at the
    // foot of the margin box rather than at the top of the page.
    const doc = [
      'version: 0.1.0',
      'page: { size: A4, margin: 25 }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        id: moved',
      '        text: moved',
      '  footer:',
      '    repeat: every_page',
      '    items: []',
      '',
    ].join('\n');
    const editor = Editor.create(doc);
    const read = (path: string) => editor.read(path);
    const drag = {
      path: 'sections.body.items[0]',
      parent: 'sections.body.items',
      from: 0,
      pointerId: 1,
      startY: 0,
      started: true,
      drop: null,
    };
    const result = rowDropOps(read, drag, { parent: 'sections.footer.items', index: 0 });
    if (result === null) throw new Error('drop refused');
    expect(editor.applyAll(result.ops).ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const margin = outcome.inspect?.margin;
    if (margin == null) throw new Error('margin missing');
    const bottom = outcome.pages[0].height / 2 - margin[2];
    const moved = outcome.inspect?.boxes.pages[0]?.find((b) => b.id === 'moved');
    if (moved == null) throw new Error('moved box missing');
    expect(moved.border.y).toBeGreaterThan(bottom - 40);
    expect(moved.border.y).toBeLessThan(bottom);
  });

  it('wraps an item in a container without moving it on the page, in every owner', async () => {
    // The wrap moves the item's position onto the new container, which resolves
    // against the same basis the item did. So the engine must draw the item where
    // it drew before, put the container's box where the item is (not at the
    // owner's origin), and report nothing new.
    const doc = (body: string[], footer: string[] = []) =>
      [
        'version: 0.1.0',
        'page: { size: A4, margin: 25 }',
        'sections:',
        '  body:',
        ...body,
        ...(footer.length > 0
          ? ['  footer:', '    repeat: every_page', '    items:', ...footer]
          : []),
        '',
      ].join('\n');
    const flowBody = (items: string[]) => ['    type: flow', '    items:', ...items];
    const cases: [string, string, string, string][] = [
      [
        'footer text',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: text, text: hello, box: { x: 10, y: 700, w: 100 } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'footer rect in percent',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { x: "10%", y: "90%", w: 50, h: 20 } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'footer line',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: line, from: { x: 10, y: 710 }, to: { x: 200, y: 700 } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'absolute body',
        doc([
          '    type: absolute',
          '    items:',
          '      - { type: text, text: hello, box: { x: 40, y: 300 } }',
        ]),
        'sections.body.items[0]',
        '{}',
      ],
      [
        'flow body',
        doc(
          flowBody([
            '      - { type: text, text: first }',
            '      - { type: text, text: hello, box: { x: 50, y: 30 } }',
          ]),
        ),
        'sections.body.items[1]',
        '{}',
      ],
      [
        'container',
        doc(
          flowBody([
            '      - type: container',
            '        box: { direction: row, h: 200 }',
            '        items:',
            '          - { type: text, text: sibling }',
            '          - { type: line, from: { x: 0, y: 150 }, to: { x: 90, y: 150 } }',
            '          - { type: text, text: hello, box: { x: 40, y: 60 } }',
          ]),
        ),
        'sections.body.items[0].items[2]',
        '{}',
      ],
      [
        'container line',
        doc(
          flowBody([
            '      - type: container',
            '        box: { direction: row, h: 200 }',
            '        items:',
            '          - { type: text, text: sibling }',
            '          - { type: line, from: { x: 0, y: 150 }, to: { x: 90, y: 150 } }',
          ]),
        ),
        'sections.body.items[0].items[1]',
        '{}',
      ],
      [
        'repeat cell',
        doc(
          flowBody([
            '      - type: repeat',
            '        data: { key: rows }',
            '        cell:',
            '          box: { h: 40 }',
            '          items:',
            '            - { type: text, text: hello, box: { x: 30, y: 12 } }',
          ]),
        ),
        'sections.body.items[0].cell.items[0]',
        '{"rows":[{},{}]}',
      ],
      [
        'repeat_flow card',
        doc(
          flowBody([
            '      - type: repeat_flow',
            '        data: { key: rows }',
            '        item:',
            '          items:',
            '            - { type: text, text: hello, box: { x: 30, y: 12 } }',
          ]),
        ),
        'sections.body.items[0].item.items[0]',
        '{"rows":[{},{}]}',
      ],
      [
        'table column cell',
        doc(
          flowBody([
            '      - type: table',
            '        data: { key: rows }',
            '        columns:',
            '          - label: name',
            '            cell:',
            '              items:',
            '                - { type: text, text: hello, box: { x: 5, y: 3 } }',
          ]),
        ),
        'sections.body.items[0].columns[0].cell.items[0]',
        '{"rows":[{},{}]}',
      ],
      [
        'grid container columnSpan',
        doc(
          flowBody([
            '      - type: container',
            '        box: { type: grid, columns: 2 }',
            '        items:',
            '          - { type: text, text: wide, box: { columnSpan: 2 } }',
            '          - { type: text, text: hello, box: { x: 30, y: 40 } }',
            '          - { type: text, text: after }',
          ]),
        ),
        'sections.body.items[0].items[0]',
        '{}',
      ],
      [
        'grid container positioned child',
        doc(
          flowBody([
            '      - type: container',
            '        box: { type: grid, columns: 2 }',
            '        items:',
            '          - { type: text, text: first }',
            '          - { type: text, text: hello, box: { x: 30, y: 40 } }',
          ]),
        ),
        'sections.body.items[0].items[1]',
        '{}',
      ],
      [
        'row container flexGrow',
        doc(
          flowBody([
            '      - type: container',
            '        box: { direction: row }',
            '        items:',
            '          - { type: text, text: fixed, box: { w: 100 } }',
            '          - { type: text, text: hello, box: { flexGrow: 1, flexBasis: 0 } }',
          ]),
        ),
        'sections.body.items[0].items[1]',
        '{}',
      ],
      [
        'footer rect in percent height',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { y: 700, w: 50, h: "10%" } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'footer rect in percent height, offset',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { x: 20, y: 700, w: 50, h: "10%" } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'footer rect with a percent minHeight',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { y: 700, w: 50, h: 20, minHeight: "10%" } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'footer rect with a percent maxHeight',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { y: 700, w: 50, h: 300, maxHeight: "10%" } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'percent height with vertical margins, in the flow body',
        doc(
          flowBody([
            '      - { type: rect, box: { w: 50, h: "10%", margin: { top: 8, bottom: 4 } } }',
            '      - { type: text, text: after }',
          ]),
        ),
        'sections.body.items[0]',
        '{}',
      ],
      [
        'percent height with a horizontal margin, in a band',
        doc(
          ['    type: flow', '    items: []'],
          [
            '      - { type: rect, box: { y: 700, w: 50, h: "10%", margin: { left: 12, right: 6 } } }',
            '      - { type: text, text: beside, box: { x: 300, y: 700 } }',
          ],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'percent height under a row container, which stretches its children',
        doc(
          flowBody([
            '      - type: container',
            '        box: { direction: row, h: 200 }',
            '        items:',
            '          - { type: rect, box: { w: 50, h: "10%" } }',
            '          - { type: text, text: beside }',
          ]),
        ),
        'sections.body.items[0].items[0]',
        '{}',
      ],
      [
        'percent height in a repeat cell',
        doc(
          flowBody([
            '      - type: repeat',
            '        data: { key: rows }',
            '        cell:',
            '          box: { h: 40 }',
            '          items:',
            '            - { type: rect, box: { x: 30, w: 50, h: "10%" } }',
            '            - { type: text, text: beside, box: { x: 200 } }',
          ]),
        ),
        'sections.body.items[0].cell.items[0]',
        '{"rows":[{},{}]}',
      ],
      [
        // The width axis: a container with no `w` is the parent width MINUS the
        // item's x, so until the width keys moved onto it these two came out
        // 50pt narrower than the item had been.
        'percent width at an x offset, in a band',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { x: 100, y: 700, w: "50%", h: 20 } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'percent minWidth beside a pt width, at an x offset',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { x: 100, y: 700, w: 60, minWidth: "50%", h: 20 } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        // The margin is a WIDTH value too, so it travels with the axis. The x
        // offset is what makes the case discriminate: with none, the container
        // is the full width and nothing differs.
        'percent width with a percent horizontal margin, in a band',
        doc(
          ['    type: flow', '    items: []'],
          [
            '      - { type: rect, box: { x: 100, y: 700, w: "50%", h: 20, margin: { left: "5%" } } }',
            '      - { type: text, text: beside, box: { x: 480, y: 700 } }',
          ],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        // A `%` BOUND with no `w` of its own: the item's width is whatever its
        // owner measures, so a `w: "100%"` written onto it would make the
        // wrapper claim the owner's whole basis. A row container measures its
        // flex children from their content.
        'percent minWidth with no width, under a row container',
        doc(
          flowBody([
            '      - type: container',
            '        box: { direction: row, h: 60, alignItems: start }',
            '        items:',
            '          - { type: text, text: bound, box: { minWidth: "50%" } }',
            '          - { type: text, text: beside }',
          ]),
        ),
        'sections.body.items[0].items[0]',
        '{}',
      ],
      [
        'percent maxWidth with no width, in an auto grid track',
        doc(
          flowBody([
            '      - type: container',
            '        box: { type: grid, columns: ["auto", "auto"], h: 60 }',
            '        items:',
            '          - { type: text, text: bound, box: { maxWidth: "50%" } }',
            '          - { type: text, text: beside }',
          ]),
        ),
        'sections.body.items[0].items[0]',
        '{}',
      ],
      [
        // A sizeless `rect` is not drawn and says so; a `w` written onto it by
        // the wrap would silence the code and draw a full-width box.
        'rect with a percent minWidth and no size (codes only)',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { x: 100, y: 700, minWidth: "50%" } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
      [
        'footer rect without size (codes only)',
        doc(
          ['    type: flow', '    items: []'],
          ['      - { type: rect, box: { x: 10, y: 700 } }'],
        ),
        'sections.footer.items[0]',
        '{}',
      ],
    ];
    const geometry = async (source: string, params: string) => {
      const outcome = await transport.renderRaw(source, params, undefined, { scale: 2 });
      return {
        codes: outcome.diagnostics.items.map((d) => d.code),
        boxes: outcome.inspect?.boxes.pages[0] ?? [],
      };
    };
    for (const [owner, source, path, params] of cases) {
      const before = await geometry(source, params);
      // A fixture that does not parse would compare two empty renders and pass.
      expect(before.codes, owner).not.toContain('parse_error');
      const editor = Editor.create(source);
      const ops = wrapInContainerOps((at) => editor.read(at), path);
      if (ops === null) throw new Error(`${owner}: wrap refused`);
      expect(editor.applyAll(ops).ok, owner).toBe(true);
      const after = await geometry(editor.text(), params);
      expect(after.codes, owner).toEqual(before.codes);
      // A rect with no size draws no box; what matters is that the document
      // still parses (its box is a required wire key).
      if (owner.endsWith('(codes only)')) {
        expect(after.codes, owner).toContain('rect_missing_size');
        continue;
      }
      const item = before.boxes.find((b) => b.path === path);
      const moved = after.boxes.find((b) => b.path === `${path}.items[0]`);
      const container = after.boxes.find((b) => b.path === path);
      if (item == null || moved == null || container == null) {
        throw new Error(`${owner}: box missing`);
      }
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        expect(moved.border[key], `${owner} item ${key}`).toBeCloseTo(item.border[key], 2);
      }
      expect(container.border.y, `${owner} container y`).toBeCloseTo(item.border.y, 2);
      // A line's x stays on its endpoints, so only a boxed item's wrapper takes it.
      if (!owner.includes('line')) {
        expect(container.border.x, `${owner} container x`).toBeCloseTo(item.border.x, 2);
      }
      // Every sibling stays put too: a wrapper that became a row slot, or lost
      // the item's share of a row or grid, would push them.
      // A repeated sub-template yields one box per element under the SAME path,
      // so siblings are compared occurrence by occurrence.
      const others = (boxes: typeof before.boxes) =>
        boxes.filter((b) => b.path !== path && !b.path.startsWith(`${path}.`));
      const again = others(after.boxes);
      others(before.boxes).forEach((sibling, n) => {
        expect(again[n]?.path, `${owner} sibling ${n}`).toBe(sibling.path);
        expect(again[n]?.border.x, `${owner} ${sibling.path} x`).toBeCloseTo(sibling.border.x, 2);
        expect(again[n]?.border.y, `${owner} ${sibling.path} y`).toBeCloseTo(sibling.border.y, 2);
      });
    }
  });

  it('refuses the percentage heights a container cannot carry, and they would break', async () => {
    // The refusal is EARNED, not defensive: each shape below renders cleanly as
    // authored, and the wrap the old code would have produced — the item moved
    // into an auto-height container verbatim — makes the engine drop the value
    // with `percent_of_auto`. So the missing affordance is the only honest
    // answer, not a case that was fine.
    const doc = (items: string[]) =>
      [
        'version: 0.1.0',
        'page: { size: A4, margin: 25 }',
        'sections:',
        '  body:',
        '    type: flow',
        '    items: []',
        '  footer:',
        '    repeat: every_page',
        '    items:',
        ...items,
        '',
      ].join('\n');
    // `wrapped` is the wrap being withheld, written out by hand: the container's
    // own box, then the item inside it. The bound cases carry TWO — the naive
    // wrap that leaves the bound on the item, and the composition the height
    // path would use if the shape were allowed (the bound MOVED, the item given
    // `h: "100%"`). The second is what the refusal's stated reason rules out, so
    // it is the one that has to be shown breaking.
    const cases: [string, string, [string, string][]][] = [
      [
        'percent minHeight with no h',
        '      - { type: rect, box: { y: 700, w: 50, minHeight: "10%" } }',
        [
          ['direction: column, y: 700', '{ type: rect, box: { w: 50, minHeight: "10%" } }'],
          [
            'direction: column, y: 700, minHeight: "10%"',
            '{ type: rect, box: { w: 50, h: "100%" } }',
          ],
        ],
      ],
      [
        'percent maxHeight with no h',
        '      - { type: rect, box: { y: 700, w: 50, maxHeight: "10%" } }',
        [
          ['direction: column, y: 700', '{ type: rect, box: { w: 50, maxHeight: "10%" } }'],
          [
            'direction: column, y: 700, maxHeight: "10%"',
            '{ type: rect, box: { w: 50, h: "100%" } }',
          ],
        ],
      ],
      [
        'a line endpoint in percent',
        '      - { type: line, from: { x: 0, y: "50%" }, to: { x: 90, y: "50%" } }',
        [
          [
            'direction: column, y: 700',
            '{ type: line, from: { x: 0, y: "50%" }, to: { x: 90, y: "50%" } }',
          ],
        ],
      ],
    ];
    for (const [name, authored, withheld] of cases) {
      const source = doc([authored]);
      const editor = Editor.create(source);
      expect(
        wrapInContainerOps((at) => editor.read(at), 'sections.footer.items[0]'),
        name,
      ).toBeNull();
      const asAuthored = await transport.renderRaw(source, '{}', undefined, { scale: 2 });
      const codes = asAuthored.diagnostics.items.map((d) => d.code);
      expect(codes, name).not.toContain('parse_error');
      expect(codes, name).not.toContain('percent_of_auto');
      for (const [containerBox, inner] of withheld) {
        const wrapped = doc([
          '      - type: container',
          `        box: { ${containerBox} }`,
          '        items:',
          `          - ${inner}`,
        ]);
        const broken = await transport.renderRaw(wrapped, '{}', undefined, { scale: 2 });
        const brokenCodes = broken.diagnostics.items.map((d) => d.code);
        const where = `${name} / ${containerBox}`;
        expect(brokenCodes, where).not.toContain('parse_error');
        expect(brokenCodes, where).toContain('percent_of_auto');
      }
    }
  });

  it('pins the one owner where the withheld wrap would have preserved the shape', async () => {
    // The refusal above is right everywhere BUT a flex row, and the prose in
    // `insert/wrap.ts` now says so — this is what holds that sentence honest.
    // A flex row hands its children a cross-axis height, and a wrapper put in
    // the item's place INHERITS it, so the basis the `%` resolves against
    // survives. A line and a `100%` bound therefore come out identical with no
    // diagnostic at all; every other bound loses the item's own stretch just as
    // silently, which is why the command is withheld here too rather than
    // appearing for one value of the percentage.
    const doc = (inner: string) =>
      [
        'version: 0.1.0',
        'page: { size: Letter, margin: 0 }',
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: container',
        '        box: { direction: row, h: 200 }',
        '        items:',
        `          - ${inner}`,
        '          - { type: text, text: beside }',
        '',
      ].join('\n');
    const wrapped = (inner: string) =>
      doc(`{ type: container, box: { direction: column }, items: [ ${inner} ] }`);
    const at = 'sections.body.items[0].items[0]';
    const measure = async (source: string, path: string) => {
      const outcome = await transport.renderRaw(source, '{}', undefined, { scale: 2 });
      const codes = outcome.diagnostics.items.map((d) => d.code);
      expect(codes).not.toContain('parse_error');
      const box = outcome.inspect?.boxes.pages[0]?.find((b) => b.path === path);
      if (box == null) throw new Error(`no box at ${path}`);
      return { codes, y: box.border.y, h: box.border.h };
    };
    const cases: [string, string, boolean][] = [
      [
        'a line endpoint in percent',
        '{ type: line, from: { x: 0, y: "10%" }, to: { x: 100, y: "10%" } }',
        true,
      ],
      ['a full-height bound', '{ type: text, text: probe, box: { minHeight: "100%" } }', true],
      [
        'a bound below full height',
        '{ type: text, text: probe, box: { minHeight: "20%" } }',
        false,
      ],
    ];
    for (const [name, inner, survives] of cases) {
      const editor = Editor.create(doc(inner));
      expect(
        wrapInContainerOps((path) => editor.read(path), at),
        name,
      ).toBeNull();
      const before = await measure(doc(inner), at);
      const after = await measure(wrapped(inner), `${at}.items[0]`);
      // The row is the owner that reports NOTHING either way — which is exactly
      // what makes the losing case worth refusing rather than warning about.
      expect(before.codes, `${name} before`).toEqual([]);
      expect(after.codes, `${name} after`).toEqual([]);
      expect(after.y, `${name} y`).toBeCloseTo(before.y, 2);
      if (survives) {
        expect(after.h, `${name} h`).toBeCloseTo(before.h, 2);
      } else {
        expect(before.h, `${name} h before`).toBeCloseTo(200, 2);
        expect(after.h, `${name} h after`).toBeCloseTo(40, 2);
      }
    }
  });

  it('skips a page number a container holds, which is why the wrap refuses one', async () => {
    const source = [
      'version: 0.1.0',
      'page: { size: A4, margin: 25 }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      '  footer:',
      '    repeat: every_page',
      '    items:',
      '      - { type: page_number, box: { x: 0, y: 700 } }',
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const read = (at: string) => editor.read(at);
    expect(wrapInContainerOps(read, 'sections.footer.items[0]')).toBeNull();
    // What the wrap would have written, by hand: the engine skips the item.
    expect(
      editor.applyAll([
        {
          op: 'insertItem',
          path: 'sections.footer.items',
          index: 0,
          value: { type: 'container', box: { x: 0, y: 700 }, items: [{ type: 'page_number' }] },
        },
        { op: 'removeItem', path: 'sections.footer.items', index: 1 },
      ]).ok,
    ).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(outcome.diagnostics.items.map((d) => d.code)).toContain('page_number_in_container');
  });

  it('drag-moves an absolute item through the manipulate model against real geometry', async () => {
    const abs = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: absolute',
      '    items:',
      '      - type: rect',
      '        id: probe',
      '        box: { x: 10, y: 10, w: 100, h: 30 }',
      '        style: { borderWidth: 1 }',
      '      - type: rect',
      '        box: { x: 10, y: 60, w: 100, h: 30 }',
      '        style: { borderWidth: 1 }',
      '',
    ].join('\n');
    const editor = Editor.create(abs);
    const read = (path: string) => editor.read(path);
    expect(manipulationFor(read, 'sections.body.items[0]')).toMatchObject({
      kind: 'move',
      place: 'absolute',
    });
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const beforeBox = before.inspect?.boxes.pages[0]?.find((b) => b.id === 'probe');
    if (beforeBox === undefined) throw new Error('probe box missing');
    const plan = planMove(
      read,
      before.inspect?.boxes.pages[0] ?? [],
      'sections.body.items[0]',
      { x: 15, y: 20 },
      { grid: 0, threshold: 0, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 25 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 30 },
    ]);
    if (plan === null) throw new Error('plan missing');
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.text()).toContain('{ x: 25, y: 30, w: 100, h: 30 }');
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const afterBox = after.inspect?.boxes.pages[0]?.find((b) => b.id === 'probe');
    expect(afterBox?.border.x).toBeCloseTo(beforeBox.border.x + 15, 5);
    expect(afterBox?.border.y).toBeCloseTo(beforeBox.border.y + 20, 5);
  });

  it('aligns absolute items left through the align model against real geometry', async () => {
    const abs = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: absolute',
      '    items:',
      '      - type: rect',
      '        id: a',
      '        box: { x: 20, y: 10, w: 60, h: 20 }',
      '        style: { borderWidth: 1 }',
      '      - type: rect',
      '        id: b',
      '        box: { x: 80, y: 50, w: 40, h: 20 }',
      '        style: { borderWidth: 1 }',
      '      - type: rect',
      '        id: c',
      '        box: { x: 50, y: 90, w: 30, h: 20 }',
      '        style: { borderWidth: 1 }',
      '',
    ].join('\n');
    const editor = Editor.create(abs);
    const read = (path: string) => editor.read(path);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const pageBoxes = before.inspect?.boxes.pages[0] ?? [];
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    // The leftmost item (a, x=20) stays; b and c author x=20 to match it.
    const ops = alignOps(read, pageBoxes, paths, 'left');
    expect(ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'x'], value: 20 },
      { op: 'setScalar', path: 'sections.body.items[2]', keys: ['box', 'x'], value: 20 },
    ]);
    expect(editor.applyAll(ops).ok).toBe(true);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const lefts = ['a', 'b', 'c'].map(
      (id) => after.inspect?.boxes.pages[0]?.find((box) => box.id === id)?.border.x,
    );
    // All three now share one left edge (the page-pt → authored mapping held).
    expect(lefts[0]).toBeCloseTo(lefts[1] ?? -1, 5);
    expect(lefts[1]).toBeCloseTo(lefts[2] ?? -1, 5);
  });

  it('keeps mm-authored positions in mm across a drag (rirekisho-style wire)', async () => {
    const mmPt = 72 / 25.4;
    const abs = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: absolute',
      '    items:',
      '      - type: rect',
      '        id: probe',
      '        box: { x: "10mm", y: "20mm", w: "50mm", h: "10mm" }',
      '        style: { borderWidth: 1 }',
      '',
    ].join('\n');
    const editor = Editor.create(abs);
    const read = (path: string) => editor.read(path);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const plan = planMove(
      read,
      before.inspect?.boxes.pages[0] ?? [],
      'sections.body.items[0]',
      { x: 2 * mmPt, y: 0 },
      { grid: 0, threshold: 0, bypass: false },
    );
    // Only the dragged axis changes, in the AUTHORED unit at 1dp.
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: '12mm' },
    ]);
    if (plan === null) throw new Error('plan missing');
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.text()).toContain('{ x: "12mm", y: "20mm", w: "50mm", h: "10mm" }');
    const beforeBox = before.inspect?.boxes.pages[0]?.find((b) => b.id === 'probe');
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const afterBox = after.inspect?.boxes.pages[0]?.find((b) => b.id === 'probe');
    if (beforeBox === undefined || afterBox === undefined) throw new Error('probe box missing');
    expect(afterBox.border.x - beforeBox.border.x).toBeCloseTo(2 * mmPt, 3);
    expect(afterBox.border.y).toBeCloseTo(beforeBox.border.y, 5);
  });

  it('resizes an absolute item from a corner handle and re-renders at the new size', async () => {
    const abs = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: absolute',
      '    items:',
      '      - type: rect',
      '        id: probe',
      '        box: { x: 10, y: 10, w: 100, h: 30 }',
      '        style: { borderWidth: 1 }',
      '',
    ].join('\n');
    const editor = Editor.create(abs);
    const read = (path: string) => editor.read(path);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const plan = planResize(
      read,
      before.inspect?.boxes.pages[0] ?? [],
      'sections.body.items[0]',
      'se',
      { x: 10, y: 5 },
      { grid: 0, threshold: 0, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 110 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 35 },
    ]);
    if (plan === null) throw new Error('plan missing');
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const afterBox = after.inspect?.boxes.pages[0]?.find((b) => b.id === 'probe');
    expect(afterBox?.border.w).toBeCloseTo(110, 5);
    expect(afterBox?.border.h).toBeCloseTo(35, 5);
  });

  it('duplicates a body item (⌘D) and re-renders with one more box, error-free', async () => {
    const editor = Editor.create(template());
    const before = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    const beforeBoxes = before.inspect?.boxes.pages.flat().length ?? 0;
    const duplicated = editor.apply({
      op: 'duplicateItem',
      path: 'sections.body.items',
      index: 0,
    });
    expect(duplicated.ok).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(outcome.inspect?.boxes.pages.flat().length ?? 0).toBe(beforeBoxes + 1);
  });

  it('rasterizes at a zoomed scale, scaling the page pixels proportionally', async () => {
    // The zoom control drives the same `scale` argument; a higher scale must
    // give proportionally larger pages. The engine ceils each scaled dimension
    // (a non-integral pt size can round the doubled value by a pixel), so assert
    // the ratio within that ±1 rounding, not an exact double.
    const at2 = await transport.renderRaw(template(), params(), definitions(), { scale: 2 });
    const at4 = await transport.renderRaw(template(), params(), definitions(), { scale: 4 });
    expect(Math.abs(at4.pages[0].width - at2.pages[0].width * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(at4.pages[0].height - at2.pages[0].height * 2)).toBeLessThanOrEqual(1);
    expect(at4.pages[0].width).toBeGreaterThan(at2.pages[0].width);
  });

  it('reports the image_source_missing error the save flow blocks on', async () => {
    const bad = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: image',
      '        box: { w: 100, h: 100 }',
      '',
    ].join('\n');
    const diagnostics = await transport.validate(bad, params(), definitions());
    expect(
      diagnostics.items.some((d) => d.code === 'image_source_missing' && d.severity === 'error'),
    ).toBe(true);
  });
});

// The page-setup surface ships the named-size point dimensions and the custom
// unit composition as GUI data (panel/pageSizes.ts). This pins BOTH against the
// real engine: a rendered page's pixel dimensions must equal ceil(pt × scale)
// (render-png ceils the scaled canvas), so any drift between the GUI table and
// the engine's own PageSize table — or a wrong unit constant — reds here.
describe('page-size dimensions pinned against the engine', () => {
  const scale = 2;

  // A minimal template of a given page size: an empty-ish flow body (one bare
  // rect so a page is emitted) whose page dimensions come only from `page:`.
  function sizedTemplate(sizeYaml: string, orientation?: string): string {
    const lines = ['version: 0.1.0', 'page:', `  size: ${sizeYaml}`];
    if (orientation !== undefined) {
      lines.push(`  orientation: ${orientation}`);
    }
    lines.push(
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: rect',
      '        box: { x: 0, y: 0, w: 10, h: 10 }',
      '',
    );
    return lines.join('\n');
  }

  it.each(PAGE_SIZES.map((size) => [size.name, size.w, size.h] as const))(
    'renders %s at ceil(pt × scale)',
    async (name, w, h) => {
      const outcome = await transport.renderRaw(sizedTemplate(name), '{}', undefined, { scale });
      expect(outcome.ok).toBe(true);
      expect(outcome.pages[0].width).toBe(Math.ceil(w * scale));
      expect(outcome.pages[0].height).toBe(Math.ceil(h * scale));
    },
  );

  it('swaps the axes for a landscape named size', async () => {
    // A4 portrait is 595.28 × 841.89pt; landscape swaps them.
    const outcome = await transport.renderRaw(sizedTemplate('A4', 'landscape'), '{}', undefined, {
      scale,
    });
    expect(outcome.pages[0].width).toBe(Math.ceil(841.89 * scale));
    expect(outcome.pages[0].height).toBe(Math.ceil(595.28 * scale));
  });

  it('renders a custom size composed from inches, matching engine length parsing', async () => {
    // The GUI writes `{ w: 8.5in, h: 13in }`; the engine parses 8.5in = 612pt,
    // 13in = 936pt (the GUI's 1in = 72pt constant must agree).
    const outcome = await transport.renderRaw(
      sizedTemplate('{ w: 8.5in, h: 13in }'),
      '{}',
      undefined,
      { scale },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.pages[0].width).toBe(Math.ceil(612 * scale));
    expect(outcome.pages[0].height).toBe(Math.ceil(936 * scale));
  });
});

// The document-defaults / styles-registry surfaces edit the wire the same engine
// consumes; these pin the model plans against the REAL engine — a rename/delete
// that failed to rewrite a reference would leave the engine emitting
// `undefined_style_name`, which is exactly what these assert is absent.
describe('styles-registry + defaults edits against the real engine', () => {
  const STYLED = [
    'styles:',
    '  heading: { fontSize: 24 }',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: Receipt',
    '        styleNames: [ heading ]',
    '',
  ].join('\n');

  it('locates an unknown key on an item and the quick-fix makes the document parse again', async () => {
    // The shape the named-style picker used to author on a line: a key
    // `LineItem` denies. The engine must name the ITEM and the KEY (not the
    // enclosing body), and the GUI fix built from them must repair it.
    const broken = [
      'styles:',
      '  heading: { fontSize: 24 }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: Receipt',
      '      - type: line',
      '        from: { x: 0, y: 0 }',
      '        to: { x: 100, y: 0 }',
      '        styleNames: [ heading ]',
      '',
    ].join('\n');
    const before = await transport.validate(broken, '{}', undefined);
    const parse = before.items.find((d) => d.code === 'parse_error');
    expect(parse?.path).toBe('sections.body.items[1]');
    expect(parse?.args.key).toBe('styleNames');
    expect(parse?.args.line).toBeUndefined();

    const editor = Editor.create(broken);
    const fix = parse ? fixFor(parse, (path) => editor.read(path)) : null;
    expect(fix).not.toBeNull();
    expect(editor.applyAll(fix?.[0]?.ops ?? []).ok).toBe(true);
    const after = await transport.validate(editor.text(), '{}', undefined);
    expect(after.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('renames a style AND its reference so the engine reports no undefined_style_name', async () => {
    const editor = Editor.create(STYLED);
    const usage = buildStyleUsage(editor.text());
    expect(usage).not.toBeNull();
    if (usage === null) {
      return;
    }
    const plan = renameStyleOps('heading', 'title', registryNames(editor.read('styles')), usage);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const edited = editor.text();
    expect(edited).toContain('title:');
    expect(edited).toContain('styleNames: [ title ]');

    const diagnostics = await transport.validate(edited, '{}', undefined);
    expect(diagnostics.items.some((d) => d.code === 'undefined_style_name')).toBe(false);
    expect(diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('deletes a style AND strips its reference, re-rendering error-free', async () => {
    const editor = Editor.create(STYLED);
    const usage = buildStyleUsage(editor.text());
    expect(usage).not.toBeNull();
    if (usage === null) {
      return;
    }
    const plan = deleteStyleOps('heading', usage);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const edited = editor.text();
    expect(edited).not.toContain('heading');

    const outcome = await transport.renderRaw(edited, '{}', undefined, { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    // The reference was stripped (emptied → removed), so no dangling name warns.
    expect(outcome.diagnostics.items.some((d) => d.code === 'undefined_style_name')).toBe(false);
  });

  it('edits defaults.style and the cascade root actually changes rendered geometry', async () => {
    // A plain (un-styled) text item inherits the cascade root, so raising
    // defaults.style.fontSize must GROW its auto-height content box — the
    // engine reflecting the edit, not merely tolerating it.
    const plain = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: measured against the cascade root',
      '',
    ].join('\n');
    const editor = Editor.create(plain);
    const fontSize = INHERITED_STYLE_FIELDS.find((f) => f.key === 'fontSize');
    expect(fontSize).toBeDefined();
    if (fontSize === undefined) {
      return;
    }
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const boxBefore = before.inspect?.boxes.pages[0]?.[0];
    expect(boxBefore).toBeDefined();

    const op = defaultStyleOp(fontSize, '18');
    expect(op).not.toBeNull();
    if (op === null) {
      return;
    }
    expect(editor.apply(op).ok).toBe(true);
    const edited = editor.text();
    expect(edited).toContain('fontSize: 18');

    const outcome = await transport.renderRaw(edited, '{}', undefined, { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const boxAfter = outcome.inspect?.boxes.pages[0]?.[0];
    // 18pt vs the 10pt engine default: the line box is measurably taller.
    expect(boxAfter?.content.h ?? 0).toBeGreaterThan(boxBefore?.content.h ?? 0);
  });
});

// The border editor authors `borderWidth`/`borderColor`/`borderStyle` (scalar
// or per-side map). These pin the wire it emits against the real engine: a
// per-side text border and a table's outer-frame preset must render + validate
// with NO border diagnostics (a bad map shape would warn `invalid_border_width`
// or reject at parse).
describe('border edits against the real engine', () => {
  const P = 'sections.body.items[0]';

  it('authors a per-side text border (mixed width/color/style) and renders clean', async () => {
    const src = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: Framed',
      '',
    ].join('\n');
    const editor = Editor.create(src);
    const read = (path: string) => editor.read(path);
    // Top: 1pt double red; right: 2pt solid default-color.
    editor.applyAll(
      edgeOps(P, readBorder(read, P), 'top', { width: 1, color: '#cc0000', style: 'double' }),
    );
    editor.applyAll(
      edgeOps(P, readBorder(read, P), 'right', { width: 2, color: '', style: 'solid' }),
    );
    const edited = editor.text();
    expect(edited).toContain('borderWidth');
    expect(edited).toContain('borderStyle');

    const outcome = await transport.renderRaw(edited, '{}', undefined, { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(outcome.diagnostics.items.some((d) => d.code === 'invalid_border_width')).toBe(false);
    const revalidated = await transport.validate(edited, '{}', undefined);
    expect(revalidated.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('authors a table outer frame via the all-sides preset and renders clean', async () => {
    const src = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: rows }',
      '        columns: [{ label: A, data: { key: a } }]',
      '',
    ].join('\n');
    const editor = Editor.create(src);
    const read = (path: string) => editor.read(path);
    editor.applyAll(
      presetOps(P, readBorder(read, P), 'all', { width: 1, color: '', style: 'solid' }),
    );
    const edited = editor.text();
    expect(edited).toContain('borderWidth: 1');

    const outcome = await transport.renderRaw(edited, '{"rows":[{"a":"x"}]}', undefined, {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(outcome.diagnostics.items.some((d) => d.code === 'invalid_border_width')).toBe(false);
  });
});

describe('iterable scaffolds against the real engine', () => {
  it('renders every variant of a definitions-group scaffold WARNING-clean', async () => {
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    const spec = scaffoldFromGroup(itemsGroup);
    for (const variant of SCAFFOLD_VARIANTS) {
      const editor = Editor.create(template());
      const target = resolveIterableTarget((path) => editor.read(path), null);
      const inserted = editor.apply({
        op: 'insertItem',
        path: target.path,
        index: target.index,
        value: scaffoldSnippet(spec, variant),
      });
      expect(inserted.ok).toBe(true);
      const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      // The scaffold promise is diagnostics-FREE (warnings included), with
      // definitions present — the schema vouches for every generated key.
      expect(outcome.diagnostics.items).toHaveLength(0);
      const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
      expect(paths).toContain(`${target.path}[${target.index}]`);
    }
  });

  it('edits an inserted grid through the panel ops and still renders WARNING-clean', async () => {
    // The grid's panel authors these keys; only the engine can say they parse
    // and lay out together. Unit suites build the ops from fixtures they wrote.
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    const editor = Editor.create(template());
    const target = resolveIterableTarget((path) => editor.read(path), null);
    const path = `${target.path}[${target.index}]`;
    expect(
      editor.apply({
        op: 'insertItem',
        path: target.path,
        index: target.index,
        value: scaffoldSnippet(scaffoldFromGroup(itemsGroup), 'repeat'),
      }).ok,
    ).toBe(true);
    const ops = [
      gridCountOp(path, 'columns', '3', '2'),
      gridGapOp(path, 'columnGap', '12'),
      fillOrderOp(path, 'column'),
      newPageOp(path, false),
    ];
    for (const op of ops) {
      if (op === null) throw new Error('a panel op refused a legal value');
      expect(editor.apply(op).ok).toBe(true);
    }
    expect(editor.text()).toContain('breakBefore: auto');
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(path);
  });

  it('names each scaffold FRAME in the box index, the tree and the panel alike, and edits it', async () => {
    // The seam: the canvas selects what the box index names, the tree gives a
    // row to what IT names, and the panel routes on `frameOf`. All three must
    // agree on the frame's path, and an edit at that path must reach the engine.
    // Neither half runs in jsdom.
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    for (const [variant, key, kind] of [
      ['repeat', 'cell', 'cell'],
      ['repeat_flow', 'item', 'card'],
    ] as const) {
      const editor = Editor.create(template());
      const target = resolveIterableTarget((path) => editor.read(path), null);
      const owner = `${target.path}[${target.index}]`;
      const frame = `${owner}.${key}`;
      expect(
        editor.apply({
          op: 'insertItem',
          path: target.path,
          index: target.index,
          value: scaffoldSnippet(scaffoldFromGroup(itemsGroup), variant),
        }).ok,
      ).toBe(true);
      const render = async () => {
        const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
          scale: 1,
        });
        expect(outcome.ok).toBe(true);
        expect(outcome.diagnostics.items).toHaveLength(0);
        return outcome.inspect?.boxes.pages.flat() ?? [];
      };
      const before = await render();
      expect(before.map((box) => box.path)).toContain(frame);
      expect(frameOf((path) => editor.read(path), frame)).toEqual({ kind, ownerPath: owner });
      const walk = (nodes: readonly TreeNode[]): TreeNode[] =>
        nodes.flatMap((node) => [node, ...walk(node.children)]);
      const tree = walk(buildTree(editor.text())?.roots ?? []);
      expect(tree.find((node) => node.path === frame)?.kind).toBe(
        kind === 'card' ? 'card_frame' : 'cell_frame',
      );

      // The scaffold's 8pt padding → 20pt: the first field moves 12pt right.
      const field = `${frame}.items[0]`;
      const x = (boxes: typeof before) => boxes.find((box) => box.path === field)?.border.x;
      const ops = paddingOps(frame, readPadding(editor.read(frame)), '20');
      if (ops === null) throw new Error('the padding field refused a legal value');
      expect(editor.applyAll(ops).ok).toBe(true);
      // Borderless and filled — the label/ticket shape the gap blocked.
      const borderOff = presetOps(
        frame,
        readBorder((path) => editor.read(path), frame),
        'none',
        {
          width: 1,
          color: '#000000',
          style: 'solid',
        },
      );
      expect(editor.applyAll(borderOff).ok).toBe(true);
      expect(
        editor.apply({
          op: 'setScalar',
          path: frame,
          keys: ['style', 'backgroundColor'],
          value: '#f5f5f5',
        }).ok,
      ).toBe(true);
      const after = await render();
      const moved = (x(after) ?? Number.NaN) - (x(before) ?? Number.NaN);
      expect(moved).toBeCloseTo(12, 3);
      const style = (editor.read(frame) as { style?: Record<string, unknown> }).style;
      // "None" over the frame's own hairline removes the key (the simplest form)
      // rather than authoring a 0; either way the frame draws no border.
      expect(style?.borderWidth ?? 0).toBe(0);
      expect(style?.backgroundColor).toBe('#f5f5f5');
    }
  });

  it("names a table column's cell FRAME in the box index as the panel and the tree do", async () => {
    const text = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: items }',
      '        columns:',
      '          - label: A',
      '            width: 200',
      '            cell:',
      '              box: { padding: 3 }',
      '              items:',
      '                - { type: text, text: x }',
      '',
    ].join('\n');
    const outcome = await transport.renderRaw(text, params(), undefined, { scale: 1 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toHaveLength(0);
    const frame = 'sections.body.items[0].columns[0].cell';
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain(frame);
    const editor = Editor.create(text);
    expect(frameOf((path) => editor.read(path), frame)?.kind).toBe('columnCell');
    const walk = (nodes: readonly TreeNode[]): TreeNode[] =>
      nodes.flatMap((node) => [node, ...walk(node.children)]);
    expect(walk(buildTree(text)?.roots ?? []).some((node) => node.path === frame)).toBe(true);

    // And an edit at that path reaches the engine: the cell's own inset 3 → 13
    // moves its first field 10pt right (`cellPadding` does not apply here).
    const field = `${frame}.items[0]`;
    const before = outcome.inspect?.boxes.pages.flat() ?? [];
    const x = (boxes: typeof before) => boxes.find((box) => box.path === field)?.border.x;
    const ops = paddingOps(frame, readPadding(editor.read(frame)), '13');
    if (ops === null) throw new Error('the padding field refused a legal value');
    expect(editor.applyAll(ops).ok).toBe(true);
    const edited = await transport.renderRaw(editor.text(), params(), undefined, { scale: 1 });
    expect(edited.ok).toBe(true);
    expect(edited.diagnostics.items).toHaveLength(0);
    const after = edited.inspect?.boxes.pages.flat() ?? [];
    expect((x(after) ?? Number.NaN) - (x(before) ?? Number.NaN)).toBeCloseTo(10, 3);
  });

  it('agrees with the engine about which variants an ABSOLUTE body skips', async () => {
    // The dialog disables exactly the variants `variantFitsBody` rejects. That
    // answer is only right if the engine skips exactly those — so ask it, per
    // variant, rather than restating the rule a second time here.
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    const spec = scaffoldFromGroup(itemsGroup);
    const absolute = ['sections:', '  body:', '    type: absolute', '    items: []', ''].join('\n');
    for (const variant of SCAFFOLD_VARIANTS) {
      const editor = Editor.create(absolute);
      expect(
        editor.apply({
          op: 'insertItem',
          path: 'sections.body.items',
          index: 0,
          value: scaffoldSnippet(spec, variant),
        }).ok,
      ).toBe(true);
      const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
        scale: 1,
      });
      const skipped = outcome.diagnostics.items.some(
        (item) => item.code === `${variant}_in_absolute_body`,
      );
      expect(skipped, variant).toBe(!variantFitsBody(variant, false));
    }
  });

  it('agrees with the engine about which owners skip a saved block', async () => {
    // A saved block's row is disabled exactly where `typeFitsOwner` rejects the
    // node for the owner `insertTargetOwner` reads off the resolved target. That
    // is only right if the engine skips exactly there — so ask it, per kind and
    // per owner, rather than restating the rule a second time here. The node is
    // inserted RAW (no band placement): the question is skip-or-not.
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    const spec = scaffoldFromGroup(itemsGroup);
    const kinds: readonly (readonly [string, SnippetValue])[] = [
      ['repeat', scaffoldSnippet(spec, 'repeat')],
      ['repeat_flow', scaffoldSnippet(spec, 'repeat_flow')],
      ['page_break', { type: 'page_break' }],
      ['page_number', { type: 'page_number' }],
      // The one kind shaped as a REFUSAL rather than a requirement: it lays
      // out in every owner but a data-scoped cell (`table_in_cell`).
      ['table', scaffoldSnippet(spec, 'table')],
      ['text', { type: 'text', text: 'control' }],
    ];
    const doc = (body: string, extra: readonly string[] = []) =>
      ['sections:', '  body:', `    type: ${body}`, ...extra, ''].join('\n');
    const owners: readonly (readonly [string, string, string])[] = [
      ['flow body', doc('flow', ['    items: []']), 'sections.body.items'],
      ['absolute body', doc('absolute', ['    items: []']), 'sections.body.items'],
      [
        'footer band',
        doc('flow', ['    items: []', '  footer:', '    repeat: every_page', '    items: []']),
        'sections.footer.items',
      ],
      [
        'container in the flow body',
        doc('flow', ['    items:', '      - type: container', '        items: []']),
        'sections.body.items[0].items',
      ],
      [
        'container in the footer band',
        doc('flow', [
          '    items: []',
          '  footer:',
          '    repeat: every_page',
          '    items:',
          '      - type: container',
          '        items: []',
        ]),
        'sections.footer.items[0].items',
      ],
      [
        'repeat cell',
        doc('flow', [
          '    items:',
          '      - type: repeat',
          '        data: { key: items }',
          '        cell:',
          '          items: []',
        ]),
        'sections.body.items[0].cell.items',
      ],
      [
        'repeat_flow card',
        doc('flow', [
          '    items:',
          '      - type: repeat_flow',
          '        data: { key: items }',
          '        item:',
          '          items: []',
        ]),
        'sections.body.items[0].item.items',
      ],
      [
        'table column cell',
        doc('flow', [
          '    items:',
          '      - type: table',
          '        data: { key: items }',
          '        columns:',
          '          - label: A',
          '            width: 200',
          '            cell:',
          '              items: []',
        ]),
        'sections.body.items[0].columns[0].cell.items',
      ],
      [
        // The ANCESTRY case: the engine's data scope is not cleared on the way
        // into a container, so this is a cell as much as the cell itself is.
        'container inside a repeat cell',
        doc('flow', [
          '    items:',
          '      - type: repeat',
          '        data: { key: items }',
          '        cell:',
          '          items:',
          '            - type: container',
          '              items: []',
        ]),
        'sections.body.items[0].cell.items[0].items',
      ],
    ];
    for (const [owner, source, path] of owners) {
      for (const [kind, node] of kinds) {
        const editor = Editor.create(source);
        const index = (editor.read(path) as unknown[]).length;
        expect(editor.apply({ op: 'insertItem', path, index, value: node }).ok).toBe(true);
        const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
          scale: 1,
        });
        const label = `${kind} in ${owner}`;
        expect(outcome.ok, label).toBe(true);
        const skipped = outcome.diagnostics.items.some((item) =>
          item.code.startsWith(`${kind}_in_`),
        );
        const fits = typeFitsOwner(
          kind,
          insertTargetOwner((at) => editor.read(at), path),
        );
        expect(skipped, label).toBe(!fits);
      }
    }
  });

  it('agrees with the engine about a table the block WRAPS, and keeps the rest', async () => {
    // `blockRefusedOwner` walks the block's `items` chain because the engine's
    // refusal travels down it. This is the join: the compositions it withholds
    // really do lose the table, and the ones it lets through really do draw it.
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    const table = scaffoldSnippet(scaffoldFromGroup(itemsGroup), 'table');
    const wrapped = { type: 'container', items: [table] } as unknown as SnippetValue;
    expect(blockRefusedOwner(wrapped)).toBe('cell');

    const doc = (body: readonly string[], extra: readonly string[] = []) =>
      ['sections:', '  body:', '    type: flow', ...body, ...extra, ''].join('\n');
    const cases: readonly (readonly [string, string, string])[] = [
      [
        'repeat cell',
        doc([
          '    items:',
          '      - type: repeat',
          '        data: { key: items }',
          '        cell:',
          '          items: []',
        ]),
        'sections.body.items[0].cell.items',
      ],
      [
        'repeat_flow card',
        doc([
          '    items:',
          '      - type: repeat_flow',
          '        data: { key: items }',
          '        item:',
          '          items: []',
        ]),
        'sections.body.items[0].item.items',
      ],
      [
        'table column cell',
        doc([
          '    items:',
          '      - type: table',
          '        data: { key: items }',
          '        columns:',
          '          - label: A',
          '            width: 200',
          '            cell:',
          '              items: []',
        ]),
        'sections.body.items[0].columns[0].cell.items',
      ],
      [
        'container inside a repeat cell',
        doc([
          '    items:',
          '      - type: repeat',
          '        data: { key: items }',
          '        cell:',
          '          items:',
          '            - type: container',
          '              items: []',
        ]),
        'sections.body.items[0].cell.items[0].items',
      ],
    ];
    for (const [label, source, path] of cases) {
      // The target really is the owner the gate reads it as…
      expect(
        insertTargetOwner((at) => Editor.create(source).read(at), path),
        label,
      ).toBe('cell');
      const editor = Editor.create(source);
      const index = (editor.read(path) as unknown[]).length;
      expect(editor.apply({ op: 'insertItem', path, index, value: wrapped }).ok, label).toBe(true);
      const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
        scale: 1,
      });
      // …the authored document PARSES (an unparseable fixture would satisfy
      // "the table is missing" for the wrong reason)…
      expect(outcome.ok, label).toBe(true);
      // …and the engine really drops the table.
      expect(
        outcome.diagnostics.items.map((item) => item.code),
        label,
      ).toContain('table_in_cell');
      // The WRAPPER still draws — it is the table inside it that is gone, so
      // the absence is addressed at the table's own path rather than by any
      // `.columns[` anywhere (the outer table in the column-cell case has its
      // own).
      const boxes = outcome.inspect?.boxes.pages.flat() ?? [];
      const wrapperPath = `${path}[${index}]`;
      expect(
        boxes.some((box) => box.path === wrapperPath),
        `${label} wrapper`,
      ).toBe(true);
      expect(
        boxes.some((box) => box.path.startsWith(`${wrapperPath}.items`)),
        `${label} table`,
      ).toBe(false);
    }

    // The CONTROL, and the capability this refusal deliberately keeps: the same
    // wrapped table in a footer band draws its columns and warns about nothing
    // of the kind.
    const band = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      '  footer:',
      '    height: 200',
      '    repeat: every_page',
      '    items: []',
      '',
    ].join('\n');
    const editor = Editor.create(band);
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.footer.items',
        index: 0,
        value: wrapped,
      }).ok,
    ).toBe(true);
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 1 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.map((item) => item.code)).not.toContain('table_in_cell');
    const boxes = outcome.inspect?.boxes.pages.flat() ?? [];
    expect(boxes.some((box) => box.path === 'sections.footer.items[0].items[0]')).toBe(true);
    expect(
      boxes.some((box) => box.path.startsWith('sections.footer.items[0].items[0].columns[')),
    ).toBe(true);
  });

  it('agrees with the engine about what BELOW a block root never draws', async () => {
    // `blockNeverDraws` is the row's note, and it is target-INDEPENDENT: the
    // claim is that no insert target makes the nested item draw. Ask the engine
    // in the two owners where each kind draws when BARE — a footer band (page
    // number) and the flow body (the rest) — so the skip cannot be the owner's.
    const groups = readDefinitionsView(definitions());
    const itemsGroup = groups?.find((group) => group.id === 'items' && group.isArray);
    if (itemsGroup == null) throw new Error('items array group missing from receipt-us');
    const spec = scaffoldFromGroup(itemsGroup);
    const kinds: readonly (readonly [string, SnippetValue])[] = [
      ['repeat', scaffoldSnippet(spec, 'repeat')],
      ['repeat_flow', scaffoldSnippet(spec, 'repeat_flow')],
      ['page_break', { type: 'page_break' }],
      ['page_number', { type: 'page_number' }],
    ];
    const table = scaffoldSnippet(spec, 'table') as unknown as { columns: unknown[] };
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      '  footer:',
      '    height: 200',
      '    repeat: every_page',
      '    items: []',
      '',
    ].join('\n');
    const owners = ['sections.body.items', 'sections.footer.items'] as const;
    const render = async (path: string, value: SnippetValue) => {
      const editor = Editor.create(source);
      expect(editor.apply({ op: 'insertItem', path, index: 0, value }).ok).toBe(true);
      const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
        scale: 1,
      });
      expect(outcome.ok).toBe(true);
      return outcome;
    };
    for (const [kind, node] of kinds) {
      // Wrapped in a container, and inside a sub-template (a table's column
      // cell, the one sub-template owner that itself draws in a band).
      const wrapped = { type: 'container', items: [node] } as unknown as SnippetValue;
      const inColumn = {
        ...table,
        columns: [...table.columns, { label: 'X', width: 60, cell: { items: [node] } }],
      } as unknown as SnippetValue;
      for (const [shape, value] of [
        ['container', wrapped],
        ['column cell', inColumn],
      ] as const) {
        expect(blockNeverDraws(value), `${kind} in ${shape}`).toBe(true);
        for (const path of owners) {
          const label = `${kind} in ${shape} at ${path}`;
          const outcome = await render(path, value);
          expect(
            outcome.diagnostics.items.some((item) => item.code.startsWith(`${kind}_in_`)),
            label,
          ).toBe(true);
          if (shape === 'container') {
            // The block still lands — its container draws, empty.
            const boxes = outcome.inspect?.boxes.pages.flat() ?? [];
            expect(
              boxes.some((box) => box.path === `${path}[0]`),
              `${label} frame`,
            ).toBe(true);
            expect(
              boxes.some((box) => box.path.startsWith(`${path}[0].items`)),
              `${label} item`,
            ).toBe(false);
          }
        }
      }
    }
    // A TABLE is the other shape: dead only inside the block's own sub-template
    // (`table_in_cell`), so it is asked in the column-cell shape alone — and a
    // merely WRAPPED table is not flagged, because it draws in both owners.
    const tableInColumn = {
      ...table,
      columns: [...table.columns, { label: 'X', width: 60, cell: { items: [table] } }],
    } as unknown as SnippetValue;
    expect(blockNeverDraws(tableInColumn)).toBe(true);
    const wrappedTable = { type: 'container', items: [table] } as unknown as SnippetValue;
    expect(blockNeverDraws(wrappedTable)).toBe(false);
    for (const path of owners) {
      const dead = await render(path, tableInColumn);
      expect(
        dead.diagnostics.items.map((item) => item.code),
        `table in column cell at ${path}`,
      ).toContain('table_in_cell');
      const drawn = await render(path, wrappedTable);
      expect(
        drawn.diagnostics.items.map((item) => item.code),
        `wrapped table at ${path}`,
      ).not.toContain('table_in_cell');
    }
    // The CONTROL: the same wrapper around a text is not flagged, and draws.
    const clean = { type: 'container', items: [{ type: 'text', text: 'ok' }] } as SnippetValue;
    expect(blockNeverDraws(clean)).toBe(false);
    for (const path of owners) {
      const boxes = (await render(path, clean)).inspect?.boxes.pages.flat() ?? [];
      expect(
        boxes.some((box) => box.path === `${path}[0].items[0]`),
        path,
      ).toBe(true);
    }
  });

  it('blank-start: extendParams rows + the scaffold render WARNING-clean without definitions', async () => {
    const blank = ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n');
    // ASCII names: this engine instance carries the en-US fonts, and a CJK
    // label would add missing_glyph noise unrelated to the scaffold claim
    // (Japanese keys themselves are covered by the scaffold unit tests).
    const fields: readonly ScaffoldField[] = [
      { name: 'item', kind: 'text' },
      { name: 'qty', kind: 'number' },
      { name: 'due', kind: 'date' },
      { name: 'done', kind: 'boolean' },
    ];
    const ext = extendParams('{}', 'lines', scaffoldSchema(fields, 'table'));
    expect(ext.ok).toBe(true);
    if (!ext.ok) return;
    const rows = (JSON.parse(ext.text) as Record<string, unknown>).lines;
    expect(Array.isArray(rows) && rows.length === 3).toBe(true);
    const editor = Editor.create(blank);
    const inserted = editor.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: scaffoldSnippet(scaffoldFromFields('lines', fields, 'table'), 'table'),
    });
    expect(inserted.ok).toBe(true);
    // Workshop posture: the preview never receives an inferred stub — the
    // render runs off the generated params alone.
    const outcome = await transport.renderRaw(editor.text(), ext.text, undefined, { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toHaveLength(0);
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths).toContain('sections.body.items[0]');
  });

  // 配置モード: pinning a 自動 container child writes the engine-resolved
  // coordinate, so the item does not move; unpinning removes the keys and it
  // reflows. Both directions are proven against the REAL engine geometry — the
  // placement model's coordinate math is only correct if these hold.
  const CONTAINER_FIXTURE = [
    'version: 0.1.0',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: container',
    '        box: { type: flex, direction: row, w: 400, h: 40, gap: 12 }',
    '        items:',
    '          - { type: text, text: Left }',
    '          - { type: text, text: Right }',
    '',
  ].join('\n');
  const CHILD_PATH = 'sections.body.items[0].items[0]';
  const findChild = (outcome: Awaited<ReturnType<EngineTransport['renderRaw']>>) =>
    outcome.inspect?.boxes.pages.flat().find((b) => b.path === CHILD_PATH);

  it('pins a 自動 container child at its resolved coordinate without moving it', async () => {
    const editor = Editor.create(CONTAINER_FIXTURE);
    const read = (path: string) => editor.read(path);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(before.ok).toBe(true);
    const beforeBox = findChild(before);
    if (beforeBox === undefined) throw new Error('child box missing');
    const placement = placementFor(read, CHILD_PATH);
    expect(placement).toMatchObject({ kind: 'pinnable', pinned: false });
    if (before.inspect === null) throw new Error('inspect missing');
    const geometry: PlacementGeometry = {
      boxes: before.inspect.boxes,
      margin: before.inspect.margin,
      fresh: true,
    };
    const resolved = resolvePlacement(geometry, read, CHILD_PATH, placement);
    if (resolved?.x == null || resolved?.y == null) throw new Error('pin coordinate unresolved');
    expect(editor.applyAll(pinOps(CHILD_PATH, resolved.x, resolved.y)).ok).toBe(true);
    expect(placementFor(read, CHILD_PATH).pinned).toBe(true);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const afterBox = findChild(after);
    // The pinned item's border sits where it was — the pin did not move it.
    expect(afterBox?.border.x).toBeCloseTo(beforeBox.border.x, 1);
    expect(afterBox?.border.y).toBeCloseTo(beforeBox.border.y, 1);
  });

  it('pins an AUTO-MARGIN (right-aligned) child without moving it — auto resolves to 0 once pinned', async () => {
    // `margin: { left: auto }` absorbs leftover space under flex placement;
    // once pinned (absolute placement) the engine resolves auto to 0, so the
    // pin math treats the inset as 0. This must hold against the REAL engine,
    // or pinning a centered/right-aligned child would move it.
    const fixture = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        box: { type: flex, direction: row, w: 400, h: 40 }',
      '        items:',
      '          - { type: text, text: Right, box: { w: 80, margin: { left: auto } } }',
      '',
    ].join('\n');
    const path = 'sections.body.items[0].items[0]';
    const editor = Editor.create(fixture);
    const read = (p: string) => editor.read(p);
    const before = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const beforeBox = before.inspect?.boxes.pages.flat().find((b) => b.path === path);
    if (beforeBox === undefined || before.inspect === null) throw new Error('geometry missing');
    const geometry: PlacementGeometry = {
      boxes: before.inspect.boxes,
      margin: before.inspect.margin,
      fresh: true,
    };
    const resolved = resolvePlacement(geometry, read, path, placementFor(read, path));
    if (resolved?.x == null || resolved?.y == null) throw new Error('pin coordinate unresolved');
    expect(editor.applyAll(pinOps(path, resolved.x, resolved.y)).ok).toBe(true);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const afterBox = after.inspect?.boxes.pages.flat().find((b) => b.path === path);
    expect(afterBox?.border.x).toBeCloseTo(beforeBox.border.x, 1);
    expect(afterBox?.border.y).toBeCloseTo(beforeBox.border.y, 1);
  });

  it('unpins a 固定 container child back to its flow position', async () => {
    const editor = Editor.create(CONTAINER_FIXTURE);
    const read = (path: string) => editor.read(path);
    const flow = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    const flowBox = findChild(flow);
    if (flowBox === undefined || flow.inspect === null) throw new Error('flow geometry missing');
    const geometry: PlacementGeometry = {
      boxes: flow.inspect.boxes,
      margin: flow.inspect.margin,
      fresh: true,
    };
    const resolved = resolvePlacement(geometry, read, CHILD_PATH, placementFor(read, CHILD_PATH));
    if (resolved?.x == null || resolved?.y == null) throw new Error('pin coordinate unresolved');
    editor.applyAll(pinOps(CHILD_PATH, resolved.x, resolved.y));
    // Now release: removeKey both coordinates, and the child reflows to exactly
    // where the flow had it.
    const ops = unpinOps(read, CHILD_PATH);
    expect(ops).toHaveLength(2);
    expect(editor.applyAll(ops).ok).toBe(true);
    expect(placementFor(read, CHILD_PATH).pinned).toBe(false);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    const afterBox = findChild(after);
    expect(afterBox?.border.x).toBeCloseTo(flowBox.border.x, 1);
    expect(afterBox?.border.y).toBeCloseTo(flowBox.border.y, 1);
  });
});

// The chip editor's declaration wire end to end against the REAL engine: the
// GUI's OWN pick planner and commit builder author `bindings:`, and the engine
// resolves the declared name through it. `order-code` carries a hyphen — the
// interpolation charset has none, so `{order-code}` prints its braces on the
// page and emits NOTHING, which is precisely the silent failure a declaration
// exists to remove. ASCII throughout, so the en-US font pack stays complete.
describe('binding declarations reach the engine (receipt-us)', () => {
  const KEY = 'order-code';
  const BODY = 'sections.body.items';

  /** receipt-us plus a hyphenated field, declared and filled. */
  function withHyphenField(key: string): { readonly defs: string; readonly data: string } {
    return {
      defs: applyDefinitionOps(definitions(), [
        {
          op: 'putValue',
          keys: ['properties', key],
          value: { type: 'string', title: 'Order code' },
        },
      ]),
      data: JSON.stringify({ ...JSON.parse(params()), [key]: 'R-2041' }),
    };
  }

  /** A body text item carrying what one chip insertion produces for `key`. */
  function authored(key: string): { readonly text: string; readonly path: string } {
    const editor = Editor.create(template());
    const index = (editor.read(BODY) as unknown[]).length;
    const path = `${BODY}[${index}]`;
    editor.apply({ op: 'insertItem', path: BODY, index, value: { type: 'text', text: 'seed' } });
    // The real pick → plan → commit path, not a hand-written snippet.
    const plan = planChipInsert(key, false, {
      scope: null,
      declared: new Map(),
      pending: [],
      text: '',
      offeredKeys: [key],
      otherNames: [],
    });
    expect(plan.decl).not.toBeNull();
    const applied = editor.applyAll(
      commitOps({
        read: (p) => editor.read(p),
        path,
        oldText: 'seed',
        newText: plan.wire,
        pending: plan.decl === null ? [] : [plan.decl],
      }),
    );
    expect(applied.ok).toBe(true);
    return { text: editor.text(), path };
  }

  it('validates and renders clean, with the declaration in the file', async () => {
    const { defs, data } = withHyphenField(KEY);
    const { text } = authored(KEY);
    expect(text).toContain('bindings:');
    expect(text).toContain(`key: ${KEY}`);
    const diags = await transport.validate(text, data, defs);
    expect(diags.items.filter((d) => d.severity === 'error')).toHaveLength(0);
    // Nothing warns either: the declared name resolves, so neither the
    // unused-declaration nor the charset report fires.
    expect(diags.items.map((d) => d.code)).not.toContain('unused_binding');
    const outcome = await transport.renderRaw(text, data, defs, { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('resolves the KEY through the declaration, not the name', async () => {
    // The declaration points at a key nothing declares: the engine reports it
    // AT THE DECLARATION, which is only possible if resolution went through
    // the map rather than treating `{ordercode}` as its own key.
    const { defs, data } = withHyphenField(KEY);
    const { text, path } = authored('order-code-typo');
    const diags = await transport.validate(text, data, defs);
    const missing = diags.items.filter((d) => d.code === 'unknown_data_key');
    expect(missing).toHaveLength(1);
    expect(missing[0].path).toBe(`${path}.bindings.ordercodetypo`);
    expect(missing[0].message).toContain('order-code-typo');
  });

  it('leaves the undeclared spelling a silent literal (the failure this removes)', async () => {
    const { defs, data } = withHyphenField(KEY);
    const editor = Editor.create(template());
    const index = (editor.read(BODY) as unknown[]).length;
    editor.apply({
      op: 'insertItem',
      path: BODY,
      index,
      value: { type: 'text', text: `{${KEY}}` },
    });
    const diags = await transport.validate(editor.text(), data, defs);
    // Not an error, not a warning — the page just prints the braces.
    expect(diags.items.filter((d) => d.severity !== 'info')).toHaveLength(0);
  });
});
