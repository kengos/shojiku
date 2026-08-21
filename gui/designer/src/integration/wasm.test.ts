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
import { Editor } from '@shojiku/designer-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { alignOps } from '../canvas/align';
import { reorderContext, siblingRects } from '../canvas/dnd';
import { planDrop } from '../canvas/dropPlan';
import { manipulationFor } from '../canvas/manipulate';
import { planMove } from '../canvas/planMove';
import { planResize } from '../canvas/planResize';
import { reparentOps } from '../canvas/reparent';
import { planReparent } from '../canvas/reparentTarget';
import { applyDefinitionOps, readDefinitionField, titleOp } from '../data/definitionsEdit';
import { type EngineTransport, TransportError } from '../engine/transport';
import { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';
import { composeDataUri } from '../image/dataUri';
import { sniffImage } from '../image/sniff';
import { resolveContainerInsert } from '../insert/containerInsert';
import { containerShape, containerSnippet } from '../insert/containerModel';
import { resolveIterableTarget } from '../insert/iterableTarget';
import { scaffoldFromGroup } from '../insert/scaffold';
import { type ScaffoldField, scaffoldFromFields, scaffoldSchema } from '../insert/scaffoldFields';
import { scaffoldSnippet } from '../insert/scaffoldSnippet';
import { wrapInContainerOps } from '../insert/wrap';
import { readBindings } from '../palette/bindings';
import { planInsertDrop } from '../palette/drag';
import { boundSnippet } from '../palette/dragSnippet';
import { readDefinitionsView } from '../palette/model';
import { buildUsage, fieldUsage } from '../palette/usage';
import { readBorder } from '../panel/borderModel';
import { edgeOps, presetOps } from '../panel/borderOps';
import { defaultStyleOp, INHERITED_STYLE_FIELDS } from '../panel/defaultsModel';
import { gridColumnsPlan, gridRowsPlan } from '../panel/gridStructure';
import { registryNames } from '../panel/itemView';
import { containerLayoutFor } from '../panel/layoutModel';
import { directionOp, gapOp, ratioOp } from '../panel/layoutOps';
import { bindingPickOps } from '../panel/model';
import { PAGE_SIZES } from '../panel/pageSizes';
import { type PlacementGeometry, resolvePlacement } from '../panel/placementGeometry';
import { pinOps, placementFor, unpinOps } from '../panel/placementModel';
import { deleteStyleOps, renameStyleOps } from '../panel/styleRefOps';
import { extendParams } from '../sample/generate';
import { buildStyleUsage } from '../styles/usage';
import { commitOps } from '../text/declCommit';
import { planChipInsert } from '../text/declMint';
import { buildTree, type TreeNode } from '../tree/model';

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
    for (const variant of ['table', 'repeat_flow', 'list'] as const) {
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
