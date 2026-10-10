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
import { Editor, type Op, type SnippetValue } from '@shojiku/designer-core';
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
import { type EngineTransport, type RenderOutcome, TransportError } from '../engine/transport';
import type { FormatCatalog, PlacedBox } from '../engine/types';
import { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';
import { anchorCandidates, pickTarget } from '../ids/anchorTargets';
import { duplicateOps } from '../ids/copyIds';
import { idEdit } from '../ids/idEdit';
import { buildIdIndex } from '../ids/idIndex';
import type { IdHolder } from '../ids/walk';
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
import { toFlowOps } from '../panel/bodyFlow';
import { toAbsoluteOps } from '../panel/bodyModel';
import { regionOps } from '../panel/bodyRegion';
import { readBorder } from '../panel/borderModel';
import { edgeOps, presetOps } from '../panel/borderOps';
import { kindSwitchOps } from '../panel/columnKindOps';
import { defaultStyleOp, INHERITED_STYLE_FIELDS } from '../panel/defaultsModel';
import { identityOp, metaTextOp } from '../panel/documentMetaModel';
import { readEdge } from '../panel/edgeModel';
import { edgeSideOps, edgeUniformOps } from '../panel/edgeOps';
import { edgeRules, FRAME_PADDING_RULES } from '../panel/edgeRules';
import { attachAnchorOps, readEllipseAnchor } from '../panel/ellipseAnchor';
import { formatOptions } from '../panel/formatModel';
import { frameOf } from '../panel/frameModel';
import { gridFillOrderOp } from '../panel/GridGapFields';
import { spanOp } from '../panel/GridSpanFields';
import { gridColumnsPlan, gridRowsPlan } from '../panel/gridStructure';
import { trackFormOp, trackKindOps, trackValueOps } from '../panel/gridTracks';
import { readGroupsView } from '../panel/groupModel';
import { imageToDataOps, imageToFixedOps } from '../panel/imageSourceOps';
import { registryNames } from '../panel/itemView';
import { containerLayoutFor } from '../panel/layoutModel';
import { basisOps, modeSwitchOps } from '../panel/layoutModeOps';
import { directionOp, gapOp, justifyContentOp, ratioOp } from '../panel/layoutOps';
import { lineArmOps, readLinePoints } from '../panel/linePoints';
import { readMark } from '../panel/markModel';
import { repointMarkOps, setCheckedOps, setMarkEqualsOp } from '../panel/markOps';
import { bindingKeyOp, bindingPickOps, formatOp, placeholderOp, plainTextOp } from '../panel/model';
import { PAGE_SIZES } from '../panel/pageSizes';
import { pickerOptions } from '../panel/pickerModel';
import { type PlacementGeometry, resolvePlacement } from '../panel/placementGeometry';
import { pinOps, placementFor, unpinOps } from '../panel/placementModel';
import { RUBY_TEXT_SIZE_PRESETS } from '../panel/RubySection';
import { fillOrderOp, gridCountOp, gridGapOp, newPageOp, relativeGapOp } from '../panel/repeatGrid';
import { addRuleOp, setRuleEqualsOp } from '../panel/rowConditionOps';
import { addRubyOp, editRubyOp, readRuby, removeRubyOp, rubySizeOp } from '../panel/rubyModel';
import { rulePresetOps } from '../panel/rulePresets';
import { fillOp, readShapeStyle, strokeColorOp, strokeWidthOp } from '../panel/shapeStyle';
import { sizeLimitOp } from '../panel/sizeLimits';
import { plainFlowCommitOps } from '../panel/spanConversion';
import { spanCommitOps } from '../panel/spanOps';
import { styleNamesOp } from '../panel/styleNamesOps';
import { deleteStyleOps, renameStyleOps } from '../panel/styleRefOps';
import { TABLE_BODY_VALIGN_CAPABILITY, TABLE_VALIGN_CAPABILITY } from '../panel/TableBandFields';
import { readTableSettings } from '../panel/tableSettingsModel';
import {
  addHeaderGroupOp,
  cellPaddingOp,
  emptyBehaviorOp,
  flagToggleOp,
  removeHeaderGroupOp,
  rowLengthOp,
  rowModeOps,
} from '../panel/tableSettingsOps';
import { bandStyleOp } from '../panel/tableStyleOps';
import { decorationToggleOp, letterSpacingOp, opacityOp } from '../panel/textLookOps';
import {
  MARK_PADDING_PRESETS,
  markPaddingOp,
  readTextMark,
  textMarkPresenceOps,
} from '../panel/textMarkModel';
import {
  combineToken,
  type TypesettingKey,
  typesettingKeys,
  typesettingOp,
  typesettingOptions,
} from '../panel/typesettingModel';
import { extendParams } from '../sample/generate';
import { buildStyleUsage } from '../styles/usage';
import { commitOps } from '../text/declCommit';
import { planChipInsert } from '../text/declMint';
import { planRuns } from '../text/runIdentity';
import type { SerializedRun } from '../text/runSerialize';
import { NO_MARKS, narrowRuns, type RunMarks } from '../text/spanRuns';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
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
  Engine: { new (): FullEngine; capabilities(): string };
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
function preparedEngine(mod: WasmModule, locale = 'en-US'): FullEngine {
  const engine = new mod.Engine();
  engine.setLocale(locale, null);
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

  it('switches a container row → grid → stack, distributes and splits — WARNING-clean against the engine', async () => {
    // The arrangement switch, the distribution and the split-by-ratio toggle are
    // GUI-built batches over keys the engine reads; this is the one place their
    // output meets the real layout. Geometry is read back from the box index,
    // so each claim is about what the engine DID with the keys.
    const editor = Editor.create(template());
    const readFn = (path: string) => editor.read(path);
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const shape = containerShape(3, 1);
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength,
        value: containerSnippet(shape as NonNullable<typeof shape>, 'Slot'),
      }).ok,
    ).toBe(true);
    const path = `sections.body.items[${bodyLength}]`;
    const render = async () => {
      const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.diagnostics.items).toEqual([]);
      return outcome.inspect?.boxes.pages.flat() ?? [];
    };
    const rect = (boxes: Awaited<ReturnType<typeof render>>, at: string) => {
      const found = boxes.find((box) => box.path === at);
      expect(found, `no box for ${at}`).toBeDefined();
      return (found as NonNullable<typeof found>).border;
    };
    const apply = (ops: Op[] | null) => {
      expect(ops).not.toBeNull();
      expect(editor.applyAll(ops as Op[]).ok).toBe(true);
    };

    // Row → grid: one row with a column per former slot, each sized the way
    // the slot was in the row — so every slot keeps its x and its width.
    const LIST = { trackList: true };
    const asRow = await render();
    const slots = [0, 1, 2].map((i) => `${path}.items[${i}]`);
    apply(modeSwitchOps(readFn, path, 'grid', LIST));
    expect(editor.read(`${path}.box.columns`)).toEqual(['auto', 'auto', 'auto']);
    let boxes = await render();
    for (const slot of slots) {
      expect(rect(boxes, slot).x).toBeCloseTo(rect(asRow, slot).x, 0);
      expect(rect(boxes, slot).w).toBeCloseTo(rect(asRow, slot).w, 0);
    }
    expect(new Set(slots.map((slot) => rect(boxes, slot).y)).size).toBe(1);

    // A span authored in the grid, then grid → stack: neither the grid keys
    // (`grid_key_ignored`) nor the span (`span_outside_grid`) may survive.
    apply([{ op: 'setScalar', path: `${path}.items[0]`, keys: ['box', 'columnSpan'], value: 2 }]);
    await render();
    apply(modeSwitchOps(readFn, path, 'column', LIST));
    boxes = await render();
    expect(rect(boxes, `${path}.items[1]`).y).toBeGreaterThan(rect(boxes, `${path}.items[0]`).y);

    // Stack → row of fixed-width slots, spread with the ends at the edges.
    apply(modeSwitchOps(readFn, path, 'row', LIST));
    apply(
      [0, 1, 2].map((i) => ({
        op: 'setScalar' as const,
        path: `${path}.items[${i}]`,
        keys: ['box', 'w'],
        value: 40,
      })),
    );
    apply([justifyContentOp(path, 'space_between')]);
    boxes = await render();
    const row = rect(boxes, path);
    expect(rect(boxes, `${path}.items[0]`).x).toBeCloseTo(row.x, 1);
    const last = rect(boxes, `${path}.items[2]`);
    expect(last.x + last.w).toBeCloseTo(row.x + row.w, 1);

    // Split by ratio: two unsized slots of very different text lengths start
    // from zero and share the row 1:1 — equal widths, whatever their content.
    apply([
      { op: 'removeKey', path: `${path}.items[0]`, keys: ['box', 'w'] },
      { op: 'removeKey', path: `${path}.items[1]`, keys: ['box', 'w'] },
      { op: 'setScalar', path: `${path}.items[1]`, keys: ['text'], value: 'a much longer label' },
    ]);
    // A line in the row takes no part: ticking writes nothing on it, so the
    // document still parses and the line still draws.
    apply([
      {
        op: 'insertItem',
        path: `${path}.items`,
        index: 3,
        value: { type: 'line', from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
      },
    ]);
    apply(basisOps(readFn, path, true));
    expect(editor.read(`${path}.items[3]`)).toEqual({
      type: 'line',
      from: { x: 0, y: 0 },
      to: { x: 20, y: 0 },
    });
    boxes = await render();
    expect(rect(boxes, `${path}.items[0]`).w).toBeCloseTo(rect(boxes, `${path}.items[1]`).w, 0);
  });

  it('edits grid tracks, per-axis gaps, a span and the fill order — WARNING-clean, geometry as authored', async () => {
    // Every grid control's op goes through the real engine here; each claim is
    // read back from the box index rather than from the document.
    const editor = Editor.create(template());
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    const shape = containerShape(3, 2);
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength,
        value: containerSnippet(shape as NonNullable<typeof shape>, 'Slot'),
      }).ok,
    ).toBe(true);
    const path = `sections.body.items[${bodyLength}]`;
    const cell = (i: number) => `${path}.items[${i}]`;
    const apply = (ops: Op[] | null) => {
      expect(ops).not.toBeNull();
      expect(editor.applyAll(ops as Op[]).ok).toBe(true);
    };
    const render = async () => {
      const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.diagnostics.items).toEqual([]);
      return outcome.inspect?.boxes.pages.flat() ?? [];
    };
    const rect = (boxes: Awaited<ReturnType<typeof render>>, at: string) => {
      const found = boxes.find((box) => box.path === at);
      expect(found, `no box for ${at}`).toBeDefined();
      return (found as NonNullable<typeof found>).border;
    };

    // Per column: auto | 2fr | 90pt, through the panel's own entry edits.
    apply([trackFormOp(path, 'columns', 'list', 3)]);
    apply(trackKindOps(path, 'columns', 0, 'auto'));
    apply(trackValueOps(path, 'columns', 1, 'fr', '2'));
    apply(trackKindOps(path, 'columns', 2, 'fixed'));
    apply(trackValueOps(path, 'columns', 2, 'fixed', '90'));
    expect(editor.read(`${path}.box.columns`)).toEqual(['auto', '2fr', 90]);
    // Column and row spacing, each on its own axis (the scaffold's shared gap
    // is overridden per axis).
    apply([gapOp(path, '10', 'columnGap') as Op, gapOp(path, '4', 'rowGap') as Op]);
    let boxes = await render();
    expect(rect(boxes, cell(2)).w).toBeCloseTo(90, 0);
    const c0 = rect(boxes, cell(0));
    const c1 = rect(boxes, cell(1));
    expect(c1.x - (c0.x + c0.w)).toBeCloseTo(10, 0);
    expect(rect(boxes, cell(3)).y - (c0.y + c0.h)).toBeCloseTo(4, 0);

    // A span over two columns: the cell is both tracks plus the gap between.
    const spanned = rect(boxes, cell(1)).w + 10 + rect(boxes, cell(2)).w;
    apply([spanOp(cell(1), 'columnSpan', '2', 3, undefined) as Op]);
    boxes = await render();
    expect(rect(boxes, cell(1)).w).toBeCloseTo(spanned, 0);
    apply([spanOp(cell(1), 'columnSpan', '1', 3, 2) as Op]);

    // Down, then across: the second cell goes under the first.
    apply([gridFillOrderOp(path, 'column')]);
    boxes = await render();
    expect(rect(boxes, cell(1)).x).toBeCloseTo(rect(boxes, cell(0)).x, 0);
    expect(rect(boxes, cell(1)).y).toBeGreaterThan(rect(boxes, cell(0)).y);
  });

  it('arranges a repeat_flow card as a row and spaces the cards — WARNING-clean, geometry as authored', async () => {
    // A card frame is edited by the container's own layout ops pointed at the
    // frame path, and the cards' gap by its own op; both meet the engine here.
    const editor = Editor.create(template());
    const readFn = (path: string) => editor.read(path);
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength,
        value: {
          type: 'repeat_flow',
          data: { key: 'items' },
          gap: 8,
          item: {
            items: [
              { type: 'text', data: { key: 'name' } },
              { type: 'text', data: { key: 'qty' } },
            ],
          },
        },
      }).ok,
    ).toBe(true);
    const flow = `sections.body.items[${bodyLength}]`;
    const card = `${flow}.item`;
    const apply = (ops: Op[] | null) => {
      expect(ops).not.toBeNull();
      expect(editor.applyAll(ops as Op[]).ok).toBe(true);
    };
    apply(modeSwitchOps(readFn, card, 'row', { trackList: true }));
    apply([relativeGapOp(flow, ['gap'], '12') as Op]);
    expect(editor.read(`${card}.box.direction`)).toBe('row');
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toEqual([]);
    const boxes = outcome.inspect?.boxes.pages.flat() ?? [];
    const cards = boxes.filter((box) => box.path === card).map((box) => box.border);
    expect(cards.length).toBe(4);
    // Cards 12pt apart, one under the next.
    expect(cards[1].y - (cards[0].y + cards[0].h)).toBeCloseTo(12, 0);
    // Inside a card the two texts now sit side by side.
    const names = boxes.filter((box) => box.path === `${card}.items[0]`).map((box) => box.border);
    const qtys = boxes.filter((box) => box.path === `${card}.items[1]`).map((box) => box.border);
    expect(qtys[0].x).toBeGreaterThan(names[0].x + names[0].w - 0.5);
    expect(qtys[0].y).toBeCloseTo(names[0].y, 0);
  });

  it('turns a repeat cell into a grid and steps its columns — WARNING-clean', async () => {
    // The cell frame goes through the same switch and the same count plans a
    // container does; this is the case that proves the plans see the frame.
    const editor = Editor.create(template());
    const readFn = (path: string) => editor.read(path);
    const bodyLength = (editor.read('sections.body.items') as unknown[]).length;
    expect(
      editor.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: bodyLength,
        value: {
          type: 'repeat',
          data: { key: 'items' },
          grid: { columns: 2, rows: 2 },
          cell: {
            items: [
              { type: 'text', data: { key: 'name' } },
              { type: 'text', data: { key: 'qty' } },
            ],
          },
        },
      }).ok,
    ).toBe(true);
    const cell = `sections.body.items[${bodyLength}].cell`;
    const apply = (ops: readonly Op[] | null) => {
      expect(ops).not.toBeNull();
      expect(editor.applyAll(ops as Op[]).ok).toBe(true);
    };
    apply(modeSwitchOps(readFn, cell, 'grid', { trackList: true }));
    const plan = gridColumnsPlan(readFn, cell, 2, 'Slot');
    expect(plan.ops.length).toBeGreaterThan(0);
    apply(plan.ops);
    expect(editor.read(`${cell}.box.type`)).toBe('grid');
    const outcome = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toEqual([]);
  });

  it('switches a flowing body to placed items and back — every item keeps its place', async () => {
    // The pins come from the engine's own boxes; the second render must put
    // every pinned item exactly where the flow drew it.
    const source = [
      'page: { size: A4, margin: 30 }',
      'sections:',
      '  body:',
      '    type: flow',
      '    gap: 12',
      '    items:',
      '      - { type: text, text: Title, box: { w: 200 } }',
      '      - { type: text, text: Second line, box: { w: 200, margin: 4 } }',
      '      - { type: rect, box: { w: 80, h: 40 } }',
      '      - { type: line, from: { x: 0, y: 6 }, to: { x: 120, y: 6 } }',
      '      - type: table',
      '        repeatHeader: true',
      '        autoPageBreak: true',
      '        data: { key: rows }',
      '        columns: [{ label: A, data: { key: a } }]',
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const read = (path: string) => editor.read(path);
    const render = async () => {
      const outcome = await transport.renderRaw(editor.text(), '{"rows":[{"a":"x"}]}', undefined, {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.diagnostics.items.filter((d) => d.severity !== 'info')).toEqual([]);
      if (outcome.inspect === null) throw new Error('inspect missing');
      return outcome.inspect;
    };
    const rects = (inspect: Awaited<ReturnType<typeof render>>) =>
      [0, 1, 2, 3, 4].map((i) => {
        const box = inspect.boxes.pages[0].find((b) => b.path === `sections.body.items[${i}]`);
        if (box === undefined) throw new Error(`no box ${i}`);
        return box.border;
      });
    const flowing = await render();
    const plan = toAbsoluteOps(read, {
      boxes: flowing.boxes,
      margin: flowing.margin,
      fresh: true,
    });
    if (plan === null || plan === 'tooMany') throw new Error('no plan');
    expect(plan.loss).toEqual({
      pastFirstPage: 0,
      unplaced: 0,
      continued: 0,
      flowOnly: 0,
      tablePaging: 1,
    });
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const placedBody = await render();
    rects(placedBody).forEach((rect, i) => {
      expect(rect.x).toBeCloseTo(rects(flowing)[i].x, 1);
      expect(rect.y).toBeCloseTo(rects(flowing)[i].y, 1);
    });
    // And back: top-to-bottom order kept, y gone, still clean.
    expect(editor.applyAll(toFlowOps(read) as Op[]).ok).toBe(true);
    expect(editor.read('sections.body.type')).toBe('flow');
    expect(editor.read('sections.body.items[2].box')).toEqual({ w: 80, h: 40, x: 0 });
    // The line came back to the stack's cursor: its endpoints start at 0.
    expect(editor.read('sections.body.items[3].from')).toEqual({ x: 0, y: 0 });
    await render();
  });

  it('switching a body that reaches page 2: what started there is deleted, page 1 stays, clean', async () => {
    // A fixed-position body draws every item on its one page, so an item the
    // flow pushed to page 2 must not survive the switch at y 0.
    const editor = Editor.create(
      [
        'page: { size: A4, margin: 25 }',
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: rect, box: { w: 100, h: 500 } }',
        '      - { type: rect, box: { w: 100, h: 500 } }',
        '      - { type: rect, box: { w: 100, h: 100 } }',
        '',
      ].join('\n'),
    );
    const read = (path: string) => editor.read(path);
    const first = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    if (first.inspect === null) throw new Error('inspect missing');
    expect(first.inspect.boxes.pages.length).toBeGreaterThan(1);
    const plan = toAbsoluteOps(read, {
      boxes: first.inspect.boxes,
      margin: first.inspect.margin,
      fresh: true,
    });
    if (plan === null || plan === 'tooMany') throw new Error('no plan');
    expect(plan.loss.pastFirstPage).toBe(2);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.read('sections.body.items')).toEqual([
      { type: 'rect', box: { w: 100, h: 500, x: 0, y: 0 } },
    ]);
    const after = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
    expect(after.ok).toBe(true);
    expect(after.diagnostics.items.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('a body between bands: the round trip keeps the first item below the header, clean', async () => {
    // The region (y + h above the footer) is dropped by the switch to placed
    // items; the switch back must rebuild one, or the first item jumps under
    // the header band and the overlap check fires.
    const source = [
      'page: { size: A4, margin: 25 }',
      'sections:',
      '  header:',
      '    height: 50',
      '    items:',
      '      - { type: text, text: Header, box: { x: 0, y: 0, w: 200 } }',
      '  body:',
      '    type: flow',
      '    box: { x: 0, y: 60, w: "100%", h: 600 }',
      '    items:',
      '      - { type: text, text: First, box: { w: 200 } }',
      '      - { type: text, text: Second, box: { w: 200 } }',
      '  footer:',
      '    height: 40',
      '    items:',
      '      - { type: text, text: Footer, box: { x: 0, y: 0, w: 200 } }',
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const read = (path: string) => editor.read(path);
    const render = async () => {
      const outcome = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 2 });
      expect(outcome.ok).toBe(true);
      expect(outcome.diagnostics.items.filter((d) => d.severity !== 'info')).toEqual([]);
      if (outcome.inspect === null) throw new Error('inspect missing');
      return outcome.inspect;
    };
    const firstY = (inspect: Awaited<ReturnType<typeof render>>) =>
      inspect.boxes.pages[0].find((b) => b.path === 'sections.body.items[0]')?.border.y;
    const flowing = await render();
    const plan = toAbsoluteOps(read, { boxes: flowing.boxes, margin: flowing.margin, fresh: true });
    if (plan === null || plan === 'tooMany') throw new Error('no plan');
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    await render();
    expect(editor.applyAll(toFlowOps(read) as Op[]).ok).toBe(true);
    // 841.89 (A4) − 2 × 25 (margins) − 40 (footer) − 60 (top).
    expect(editor.read('sections.body.box')).toEqual({ x: 0, y: 60, w: '100%', h: 691.89 });
    const back = await render();
    expect(firstY(back)).toBeCloseTo(firstY(flowing) as number, 1);
    // A one-field region edit on a body with no region writes a whole one.
    expect(editor.apply({ op: 'removeKey', path: 'sections.body', keys: ['box'] }).ok).toBe(true);
    const edit: Op = { op: 'setScalar', path: 'sections.body', keys: ['box', 'y'], value: 60 };
    expect(editor.applyAll(regionOps(read, 'sections.body', edit) ?? []).ok).toBe(true);
    expect(firstY(await render())).toBeCloseTo(firstY(flowing) as number, 1);
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

// The image's source switch: the panel's op builders applied to a real Editor,
// then rendered by the real engine. Both keys or neither refuse the whole render
// (`image_source_conflict` / `image_source_missing` are validation errors), so
// no switch may leave either; and the fit the bound arm now offers must be one
// the engine draws for a bound image.
describe('the image source switch, through the real engine', () => {
  const P = 'sections.body.items[0]';
  const RED_20X10 =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#ff0000"/></svg>';
  const svgUri = composeDataUri('svg', new TextEncoder().encode(RED_20X10));
  const BOX = 'box: { x: 10, y: 10, w: 40, h: 40 }';
  const doc = (item: string) =>
    [
      'version: 0.1.0',
      'page: { size: A4 }',
      'sections:',
      '  body:',
      '    type: absolute',
      '    items:',
      `      - ${item}`,
      '',
    ].join('\n');
  const SOURCE_CODES = new Set(['image_source_missing', 'image_source_conflict']);

  async function both(text: string, params: string) {
    const validation = await transport.validate(text, params);
    const outcome = await transport.renderRaw(text, params, undefined, { scale: 2 });
    return { validation, outcome };
  }

  function contentRect(outcome: RenderOutcome) {
    return outcome.inspect?.boxes.pages.flat().find((box) => box.path === P)?.content;
  }

  it('a fixed image switched to data renders, warning only that the empty key has no value', async () => {
    const editor = Editor.create(doc(`{ type: image, ${BOX}, src: "${svgUri}" }`));
    expect(editor.applyAll(imageToDataOps(P, { hasSrc: true }, null))).toEqual({ ok: true });
    const { validation, outcome } = await both(editor.text(), '{}');
    expect(validation.items.filter((d) => SOURCE_CODES.has(d.code))).toEqual([]);
    expect(outcome.ok).toBe(true);
    const atItem = outcome.diagnostics.items.filter((d) => d.path === P);
    expect(atItem.map((d) => `${d.severity}:${d.code}`).sort()).toEqual([
      'warning:missing_asset',
      'warning:missing_data',
    ]);
  });

  it('a remembered binding restored by the switch draws the field’s image', async () => {
    const editor = Editor.create(doc(`{ type: image, ${BOX}, src: "${svgUri}" }`));
    editor.applyAll(imageToDataOps(P, { hasSrc: true }, { key: 'logo', scope: '' }));
    const { outcome } = await both(editor.text(), JSON.stringify({ logo: svgUri }));
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toEqual([]);
    expect(contentRect(outcome)).toBeDefined();
  });

  it('a bound image made fixed renders error-free with its box', async () => {
    const editor = Editor.create(doc(`{ type: image, ${BOX}, data: { key: logo } }`));
    expect(editor.applyAll(imageToFixedOps(P, svgUri))).toEqual({ ok: true });
    const { validation, outcome } = await both(editor.text(), '{}');
    expect(validation.items).toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items).toEqual([]);
    expect(contentRect(outcome)).toBeDefined();
  });

  it('honours the fit the bound arm writes: stretch fills the box a contain leaves blank', async () => {
    const params = JSON.stringify({ logo: svgUri });
    const topCentre = async (text: string) => {
      const { outcome } = await both(text, params);
      const rect = contentRect(outcome);
      const page = outcome.pages[0];
      if (rect === undefined || page === undefined) throw new Error('no box or page');
      // A 20×10 image contained in 40×40 leaves 10pt bands above and below.
      const x = Math.round((rect.x + rect.w / 2) * 2);
      const y = Math.round((rect.y + 2) * 2);
      const i = (y * page.width + x) * 4;
      return Array.from(page.rgba.slice(i, i + 3));
    };
    const editor = Editor.create(doc(`{ type: image, ${BOX}, data: { key: logo } }`));
    expect(await topCentre(editor.text())).toEqual([255, 255, 255]);
    editor.apply(plainTextOp(P, ['fit'], 'stretch'));
    expect(await topCentre(editor.text())).toEqual([255, 0, 0]);
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
      const ops = edgeUniformOps(
        frame,
        'padding',
        readEdge(editor.read(frame), 'padding'),
        '20',
        FRAME_PADDING_RULES,
      );
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
    const ops = edgeUniformOps(
      frame,
      'padding',
      readEdge(editor.read(frame), 'padding'),
      '13',
      FRAME_PADDING_RULES,
    );
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

// The table's row and page settings, authored through the panel's own op
// builders and read back from the engine's box index — the join between what
// the panel writes and what the engine lays out, which neither side's suite
// executes on its own.
describe('table row and page settings against the real engine (receipt-us)', () => {
  it('lays the rows out at the heights the panel authors, warning-free', async () => {
    const editor = Editor.create(template());
    const bodyItems = editor.read('sections.body.items') as readonly { type?: string }[];
    const tableIndex = bodyItems.findIndex((item) => item?.type === 'table');
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    const table = `sections.body.items[${tableIndex}]`;

    // The BEFORE render must itself parse, or a codes comparison is two parse
    // errors agreeing with each other.
    const before = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 1 });
    expect(before.ok).toBe(true);
    expect(before.diagnostics.items.some((d) => d.code === 'parse_error')).toBe(false);
    const beforeCodes = new Set(before.diagnostics.items.map((d) => d.code));

    const view = readTableSettings(editor.read(table));
    const columnCount = (editor.read(`${table}.columns`) as readonly unknown[]).length;
    const ops = [
      ...(rowModeOps(table, view, 'fixed') ?? []),
      rowLengthOp(table, ['row', 'height'], '44', 'positive'),
      rowLengthOp(table, ['header', 'height'], '48', 'positive'),
      cellPaddingOp(table, view.cellPadding, '6'),
      emptyBehaviorOp(table, view.emptyBehavior, 'reserve'),
      flagToggleOp(table, 'mergeEmptyCells', view.mergeEmptyCells),
      flagToggleOp(table, 'autoPageBreak', view.autoPageBreak),
      flagToggleOp(table, 'repeatHeader', view.repeatHeader),
      flagToggleOp(table, 'keepTogether', view.keepTogether),
      addHeaderGroupOp(table, readGroupsView(editor.read(table)) ?? [], columnCount, 'Group'),
    ];
    for (const op of ops) {
      expect(op).not.toBeNull();
    }
    expect(editor.applyAll(ops as Op[]).ok).toBe(true);

    const after = await transport.renderRaw(editor.text(), params(), definitions(), { scale: 1 });
    expect(after.ok).toBe(true);
    const newCodes = after.diagnostics.items.filter((d) => !beforeCodes.has(d.code));
    expect(newCodes).toEqual([]);

    // The first page's column-0 placements: the header cell at the header
    // height, every body cell at the fixed row height. (Both roomy on purpose: a
    // fixed height activates the cells' `textOverflow`, and this example's item
    // names and one header label wrap to two lines, which a row shorter than
    // their 28pt plus the 6pt padding each side reports as `text_overflow`.)
    const first = after.inspect?.boxes.pages[0] ?? [];
    const cells = first
      .filter((box) => box.path === `${table}.columns[0]`)
      .sort((a, b) => a.border.y - b.border.y);
    expect(cells.length).toBeGreaterThan(2);
    expect(cells[0]?.border.h).toBeCloseTo(48, 3);
    for (const cell of cells.slice(1)) {
      expect(cell.border.h).toBeCloseTo(44, 3);
    }
    expect(first.some((box) => box.path === `${table}.headerGroups[0]`)).toBe(true);

    // And the group comes back out, leaving the rest as it was.
    expect(editor.apply(removeHeaderGroupOp(table, 0, 1)).ok).toBe(true);
    const removed = await transport.renderRaw(editor.text(), params(), definitions(), {
      scale: 1,
    });
    expect(removed.diagnostics.items.filter((d) => !beforeCodes.has(d.code))).toEqual([]);
    expect(
      removed.inspect?.boxes.pages[0]?.some((box) => box.path === `${table}.headerGroups[0]`),
    ).toBe(false);
  });
});

// The two keys the table panel gates its vertical-alignment controls on are the
// ENGINE's spellings, read from the real capability list: a Designer constant
// that drifted from the engine's key would withhold the control on every
// engine, with each side's own suite still green.
describe('table vertical-alignment gates against the real engine', () => {
  it('finds both keys the panel gates on in the engine’s capability list', () => {
    const { capabilities } = JSON.parse(wasmModule.Engine.capabilities()) as {
      capabilities: string[];
    };
    expect(capabilities).toContain(TABLE_VALIGN_CAPABILITY);
    expect(capabilities).toContain(TABLE_BODY_VALIGN_CAPABILITY);
  });
});

// The table's STYLE wire, authored through the panel's own op builders — band
// named styles, the even rows' list and stripe colour, a header group's own
// style, the band controls past the original four, a rule preset and a rule's
// `equals: false` — and handed to the real engine, which must parse all of it
// and warn about none. Neither side's suite executes this join on its own.
describe('table style edits against the real engine (receipt-us)', () => {
  it('renders every style key the panel writes, warning-free', async () => {
    const editor = Editor.create(template());
    const bodyItems = editor.read('sections.body.items') as readonly { type?: string }[];
    const table = `sections.body.items[${bodyItems.findIndex((item) => item?.type === 'table')}]`;
    // A boolean on every row, so `equals: false` has something to match —
    // and a row without it, which must stay silent.
    const data = JSON.parse(params()) as { items: Record<string, unknown>[] };
    data.items = data.items.map((row, index) =>
      index === 0 ? row : { ...row, void: index % 2 === 0 },
    );
    const rowParams = JSON.stringify(data);

    const before = await transport.renderRaw(editor.text(), rowParams, undefined, { scale: 1 });
    expect(before.diagnostics.items.some((d) => d.code === 'parse_error')).toBe(false);
    const beforeCodes = new Set(before.diagnostics.items.map((d) => d.code));

    const columnCount = (editor.read(`${table}.columns`) as readonly unknown[]).length;
    const setup: Op[] = [
      { op: 'setScalar', keys: ['styles', 'banner', 'fontWeight'], value: 'bold' },
      addHeaderGroupOp(table, readGroupsView(editor.read(table)) ?? [], columnCount, 'Group') as Op,
    ];
    expect(editor.applyAll(setup).ok).toBe(true);
    const group = `${table}.headerGroups[0]`;
    const style: Op[] = [
      styleNamesOp(table, ['banner'], ['header', 'styleNames']),
      styleNamesOp(table, ['banner'], ['row', 'styleNames']),
      styleNamesOp(table, ['banner'], ['row', 'alternateStyleNames']),
      bandStyleOp(table, 'zebra', 'backgroundColor', '#e8eef6'),
      { op: 'setScalar', path: table, keys: ['header', 'style', 'verticalAlign'], value: 'top' },
      { op: 'setScalar', path: table, keys: ['header', 'style', 'fontFamily'], value: 'noto-sans' },
      { op: 'setScalar', path: table, keys: ['row', 'style', 'fontStyle'], value: 'italic' },
      { op: 'setScalar', path: table, keys: ['row', 'style', 'fontSize'], value: 9 },
      { op: 'setScalar', path: table, keys: ['style', 'color'], value: '#333333' },
      { op: 'setScalar', path: group, keys: ['style', 'backgroundColor'], value: '#dbe7ff' },
      { op: 'setScalar', path: group, keys: ['style', 'verticalAlign'], value: 'bottom' },
      { op: 'setScalar', path: table, keys: ['row', 'style', 'verticalAlign'], value: 'bottom' },
      { op: 'setScalar', path: table, keys: ['style', 'verticalAlign'], value: 'top' },
      styleNamesOp(group, ['banner']),
    ];
    expect(editor.applyAll(style).ok).toBe(true);
    const entries = () => (editor.read(`${table}.row.conditionalStyles`) as unknown[]) ?? [];
    expect(editor.apply(addRuleOp(table, [])).ok).toBe(true);
    const rule = `${table}.row.conditionalStyles[0]`;
    const ruleOps: Op[] = [
      { op: 'setScalar', path: rule, keys: ['when', 'key'], value: 'void' },
      setRuleEqualsOp(table, entries(), 0, 'false', 'boolean') as Op,
      ...rulePresetOps(rule, editor.read(rule), 'red'),
      styleNamesOp(rule, ['banner']),
      { op: 'setScalar', path: rule, keys: ['style', 'verticalAlign'], value: 'middle' },
    ];
    expect(editor.applyAll(ruleOps).ok).toBe(true);
    // The boolean literal, not the text: the engine's predicate is type-strict.
    expect(editor.text()).toMatch(/equals:\s*false\s*$/m);

    const after = await transport.renderRaw(editor.text(), rowParams, undefined, { scale: 1 });
    expect(after.ok).toBe(true);
    expect(after.diagnostics.items.filter((d) => !beforeCodes.has(d.code))).toEqual([]);
    expect(after.inspect?.boxes.pages[0]?.some((box) => box.path === group)).toBe(true);

    // The positive control for the set-difference above: a family the engine
    // cannot resolve DOES surface as a new diagnostic, so the empty diff is a
    // measurement of the font key rather than a blind spot.
    const header = ['header', 'style', 'fontFamily'];
    expect(
      editor.apply({ op: 'setScalar', path: table, keys: header, value: 'no-such-family' }).ok,
    ).toBe(true);
    const unknown = await transport.renderRaw(editor.text(), rowParams, undefined, { scale: 1 });
    expect(unknown.diagnostics.items.filter((d) => !beforeCodes.has(d.code))).not.toEqual([]);
  });

  it('locates a rule whose `scope` is ignored, and the quick-fix clears the warning', async () => {
    // The rule UI never shows `scope`, so the diagnostics fix is the only way
    // to clear it: the engine's path must be one the GUI fix can act on.
    const editor = Editor.create(template());
    const bodyItems = editor.read('sections.body.items') as readonly { type?: string }[];
    const table = `sections.body.items[${bodyItems.findIndex((item) => item?.type === 'table')}]`;
    const existing = (editor.read(`${table}.row.conditionalStyles`) as unknown[] | undefined) ?? [];
    expect(editor.apply(addRuleOp(table, existing)).ok).toBe(true);
    const rule = `${table}.row.conditionalStyles[${existing.length}]`;
    const ruleOps: Op[] = [
      { op: 'setScalar', path: rule, keys: ['when', 'key'], value: 'name' },
      { op: 'setScalar', path: rule, keys: ['when', 'scope'], value: 'document' },
    ];
    expect(editor.applyAll(ruleOps).ok).toBe(true);

    const before = await transport.validate(editor.text(), params(), undefined);
    const ignored = before.items.find((d) => d.code === 'row_condition_scope_ignored');
    expect(ignored?.path).toBe(rule);
    const fix = ignored ? fixFor(ignored, (path) => editor.read(path)) : null;
    expect(fix).not.toBeNull();
    expect(editor.applyAll(fix?.[0]?.ops ?? []).ok).toBe(true);
    expect(editor.text()).not.toContain('scope');

    const after = await transport.validate(editor.text(), params(), undefined);
    expect(after.items.some((d) => d.code === 'row_condition_scope_ignored')).toBe(false);
  });
});

// The text-and-box style keys the panel now writes, authored through the SAME
// op builders the fields dispatch and handed to the real engine. Each case asks
// two things: the file still parses and draws with no error or `invalid_*`
// diagnostic (a builder writing a shape the wire refuses would fail here, not in
// a unit test that only reads its own output), and where a key MOVES something
// measurable, that it moved — a key the engine silently ignored would pass the
// first half alone.
describe('text and box style edits against the real engine', () => {
  const P = 'sections.body.items[0]';
  const flow = (item: readonly string[]) =>
    ['version: 0.1.0', 'sections:', '  body:', '    type: flow', '    items:', ...item, ''].join(
      '\n',
    );

  async function draw(text: string) {
    const outcome = await transport.renderRaw(text, '{"rows":[{"a":"x"}]}', undefined, {
      scale: 1,
    });
    expect(outcome.ok).toBe(true);
    const bad = outcome.diagnostics.items.filter(
      (d) => d.severity === 'error' || d.code.startsWith('invalid_'),
    );
    expect(bad).toEqual([]);
    return outcome.inspect?.boxes.pages.flat().find((box) => box.path === P);
  }

  function edit(src: string, build: (editor: Editor) => readonly (Op | null)[]) {
    const editor = Editor.create(src);
    for (const op of build(editor)) {
      if (op === null) throw new Error('a builder refused a legal value');
      expect(editor.apply(op).ok).toBe(true);
    }
    return editor.text();
  }

  const textItem = flow([
    '      - type: text',
    '        text: Hello',
    '        box: { w: 200, h: 80 }',
  ]);

  it('moves the text down with verticalAlign: middle', async () => {
    const before = await draw(textItem);
    const after = await draw(
      edit(textItem, () => [plainTextOp(P, ['style', 'verticalAlign'], 'middle')]),
    );
    const baseline = (box: typeof before) =>
      box?.text !== undefined && 'lines' in box.text ? box.text.lines[0]?.baseline : undefined;
    expect((baseline(after) ?? 0) - (baseline(before) ?? 0)).toBeGreaterThan(10);
  });

  it('widens the line with letterSpacing, in pt and in em', async () => {
    const width = (box: Awaited<ReturnType<typeof draw>>) =>
      box?.text !== undefined && 'lines' in box.text ? box.text.lines[0]?.width : undefined;
    const before = width(await draw(textItem));
    for (const value of ['2', '0.2em']) {
      const after = width(await draw(edit(textItem, () => [letterSpacingOp(P, '', value)])));
      expect((after ?? 0) - (before ?? 0)).toBeGreaterThan(5);
    }
  });

  it('draws underline and strikethrough together, as the two checkboxes write them', async () => {
    const tick = (editor: Editor, line: 'underline' | 'line_through') =>
      decorationToggleOp(
        P,
        effectiveValueIn(
          cascadeContext((p) => editor.read(p), P),
          'textDecoration',
        ),
        line,
        true,
      );
    const once = edit(textItem, (editor) => [tick(editor, 'underline')]);
    const both = edit(once, (editor) => [tick(editor, 'line_through')]);
    expect(both).toContain('textDecoration: underline line_through');
    await draw(both);
  });

  it('draws a decoration line, an overflow policy and an opacity cleanly', async () => {
    await draw(
      edit(textItem, () => [
        plainTextOp(P, ['style', 'textDecoration'], 'line_through'),
        plainTextOp(P, ['style', 'textOverflow'], 'shrink'),
        opacityOp(P, '', '40'),
      ]),
    );
  });

  it('insets the content with a per-side padding in units', async () => {
    const before = await draw(textItem);
    const text = edit(textItem, (editor) => [
      ...(edgeSideOps(
        P,
        'padding',
        readEdge(editor.read(P), 'padding'),
        'left',
        '10mm',
        edgeRules(
          'padding',
          'text',
          placementFor((p) => editor.read(p), P),
        ),
      ) ?? [null]),
    ]);
    expect(text).toContain('padding: { left: 10mm }');
    const after = await draw(text);
    expect((after?.content.x ?? 0) - (before?.content.x ?? 0)).toBeCloseTo(28.35, 1);
  });

  it('centres a fixed-width item with auto left and right margins in the flow body', async () => {
    const rules = (editor: Editor) =>
      edgeRules(
        'margin',
        'text',
        placementFor((p) => editor.read(p), P),
      );
    const step1 = edit(textItem, (editor) => [
      ...(edgeSideOps(
        P,
        'margin',
        readEdge(editor.read(P), 'margin'),
        'left',
        'auto',
        rules(editor),
      ) ?? [null]),
    ]);
    const text = edit(step1, (editor) => [
      ...(edgeSideOps(
        P,
        'margin',
        readEdge(editor.read(P), 'margin'),
        'right',
        'auto',
        rules(editor),
      ) ?? [null]),
    ]);
    const before = await draw(textItem);
    const after = await draw(text);
    expect((after?.border.x ?? 0) - (before?.border.x ?? 0)).toBeGreaterThan(50);
  });

  it('grows an automatic height to minHeight', async () => {
    const auto = flow(['      - type: text', '        text: Hello', '        box: { w: 200 }']);
    const text = edit(auto, () => [sizeLimitOp(P, 'minHeight', '', '30mm')]);
    const after = await draw(text);
    expect(after?.border.h ?? 0).toBeCloseTo(85.04, 1);
    // A maximum below the minimum loses (CSS order: min wins), and a max width
    // narrows an authored one.
    const bounded = edit(text, () => [
      sizeLimitOp(P, 'maxHeight', '', '10mm'),
      sizeLimitOp(P, 'maxWidth', '', '100'),
      sizeLimitOp(P, 'minWidth', '', '20'),
    ]);
    const clamped = await draw(bounded);
    expect(clamped?.border.h ?? 0).toBeCloseTo(85.04, 1);
    expect(clamped?.border.w ?? 0).toBeCloseTo(100, 1);
  });

  it('styles a page number, a list, a container and a char_grid cleanly', async () => {
    await draw(
      edit(
        [
          'version: 0.1.0',
          'sections:',
          '  footer:',
          '    items:',
          '      - type: page_number',
          '        box: { x: 0, y: 0, w: 100, h: 20 }',
          '  body:',
          '    type: flow',
          '    items:',
          '      - { type: text, text: x }',
          '',
        ].join('\n'),
        () => [
          plainTextOp('sections.footer.items[0]', ['style', 'verticalAlign'], 'bottom'),
          letterSpacingOp('sections.footer.items[0]', '', '1'),
          plainTextOp('sections.footer.items[0]', ['style', 'backgroundColor'], '#eeeeee'),
          {
            op: 'setScalar',
            path: 'sections.footer.items[0]',
            keys: ['style', 'borderWidth'],
            value: 1,
          },
        ],
      ),
    );
    await draw(
      edit(
        flow(['      - type: list', '        data: { key: rows }', '        text: "{a}"']),
        () => [
          plainTextOp(P, ['style', 'textDecoration'], 'underline'),
          letterSpacingOp(P, '', '0.5mm'),
          { op: 'setScalar', path: P, keys: ['style', 'borderWidth'], value: 1 },
        ],
      ),
    );
    await draw(
      edit(flow(['      - type: container', '        box: { h: 20 }', '        items: []']), () => [
        plainTextOp(P, ['style', 'overflow'], 'hidden'),
        letterSpacingOp(P, '', '1'),
        plainTextOp(P, ['style', 'fontWeight'], 'bold'),
      ]),
    );
    await draw(
      edit(
        flow([
          '      - type: char_grid',
          '        text: abc',
          '        grid: { charsPerLine: 5, lines: 2 }',
        ]),
        () => [
          plainTextOp(P, ['style', 'color'], '#cc0000'),
          plainTextOp(P, ['style', 'fontFamily'], 'biz-ud-gothic'),
          opacityOp(P, '', '50'),
        ],
      ),
    );
  });
});

describe('table column kinds the panel authors, rendered by the real engine', () => {
  // A valid 1×1 RGB PNG (CRC-correct chunks) the engine decodes.
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM45KAFAAL0AS1AMrjaAAAAAElFTkSuQmCC';
  // The example has no image field; give its rows one, declared as an image.
  const photoDefinitions = () => {
    const defs = definitions().replace(
      '      properties:\n        name:\n',
      '      properties:\n        photo:\n          type: string\n          format: image\n        name:\n',
    );
    expect(defs).toContain('photo:');
    return defs;
  };
  const photoParams = () => {
    const parsed = JSON.parse(params()) as { items: Record<string, unknown>[] };
    for (const row of parsed.items) {
      row.photo = `data:image/png;base64,${PNG}`;
    }
    return JSON.stringify(parsed);
  };
  // The one diagnostic a GUI-authored column may add: the example's rows are
  // short, so a QR code drawn to the row height is smaller than its modules
  // want. Anything else new is a fault.
  const EXPECTED_NEW = new Set(['qr_module_too_small']);

  interface Placed {
    readonly path: string;
    readonly border: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    };
    readonly content: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    };
  }

  async function render(text: string) {
    const outcome = await transport.renderRaw(text, photoParams(), photoDefinitions(), {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    const boxes = (outcome.inspect?.boxes.pages.flat() ?? []) as unknown as readonly Placed[];
    return { codes: outcome.diagnostics.items.map((d) => d.code), boxes };
  }

  it('draws QR code, image and free-layout columns, and every switch back out', async () => {
    const editor = Editor.create(template());
    const read = (path: string) => editor.read(path);
    const bodyItems = editor.read('sections.body.items') as readonly { type?: string }[];
    const table = `sections.body.items[${bodyItems.findIndex((item) => item?.type === 'table')}]`;
    // The example's columns already fill the table's width, so the kinds go on
    // existing ones (a new column would get a near-zero leftover share).
    const name = `${table}.columns[0]`;
    const code = `${table}.columns[1]`;
    const photo = `${table}.columns[2]`;
    const baseline = new Set((await render(editor.text())).codes);
    const onlyExpected = (codes: readonly string[]) =>
      expect(codes.filter((c) => !baseline.has(c) && !EXPECTED_NEW.has(c))).toEqual([]);

    // An image column and a QR code column, as the panel builds them.
    expect(editor.apply(bindingKeyOp(photo, 'photo')).ok).toBe(true);
    expect(editor.applyAll(kindSwitchOps(read, photo, 'image')).ok).toBe(true);
    expect(editor.apply(plainTextOp(photo, ['fit'], 'cover')).ok).toBe(true);
    expect(editor.apply(bindingKeyOp(code, 'name')).ok).toBe(true);
    expect(editor.applyAll(kindSwitchOps(read, code, 'qr_code')).ok).toBe(true);
    expect(editor.apply(placeholderOp(code, 'none')).ok).toBe(true);
    let drawn = await render(editor.text());
    onlyExpected(drawn.codes);
    const before = drawn.boxes.filter((b) => b.path === name);
    expect(drawn.boxes.some((b) => b.path === photo)).toBe(true);
    expect(drawn.boxes.some((b) => b.path === code)).toBe(true);

    // Every bound kind into a free-layout cell: the carried item draws, and the
    // text sits where the column's own content sat — the frame carries the
    // table's cell padding and the column's (middle) vertical alignment.
    for (const path of [photo, code, name]) {
      expect(editor.applyAll(kindSwitchOps(read, path, 'cell')).ok).toBe(true);
    }
    drawn = await render(editor.text());
    onlyExpected(drawn.codes);
    for (const path of [photo, code]) {
      expect(drawn.boxes.some((b) => b.path === `${path}.cell.items[0]`)).toBe(true);
    }
    const carried = drawn.boxes.filter((b) => b.path === `${name}.cell.items[0]`);
    // The header label is a cell of the column too; the carried item is per row.
    const rows = before.slice(before.length - carried.length);
    expect(carried.length).toBeGreaterThan(1);
    carried.forEach((item, i) => {
      const cell = rows[i].content;
      expect(item.border.x).toBeCloseTo(cell.x, 2);
      expect(item.border.w).toBeCloseTo(cell.w, 2);
      expect(item.border.y + item.border.h / 2).toBeCloseTo(cell.y + cell.h / 2, 2);
    });

    // And back out: each cell's binding returns to its column.
    expect(editor.applyAll(kindSwitchOps(read, photo, 'image')).ok).toBe(true);
    expect(editor.applyAll(kindSwitchOps(read, code, 'qr_code')).ok).toBe(true);
    expect(editor.applyAll(kindSwitchOps(read, name, 'text')).ok).toBe(true);
    expect(editor.read(photo)).toMatchObject({
      type: 'image',
      fit: 'cover',
      data: { key: 'photo' },
    });
    expect(editor.read(code)).toMatchObject({
      type: 'qr_code',
      data: { key: 'name', placeholder: 'none' },
    });
    drawn = await render(editor.text());
    onlyExpected(drawn.codes);
    for (const path of [photo, code, name]) {
      expect(drawn.boxes.some((b) => b.path === path)).toBe(true);
      expect(drawn.boxes.some((b) => b.path === `${path}.cell.items[0]`)).toBe(false);
    }
  });
});

describe('names the Designer writes, resolved by the real engine', () => {
  // The JOIN for the name field and the copy renaming: `ids/` decides every
  // write from its own model of the namespace, and the ENGINE is what resolves
  // an anchor against it. Each step here is written by the same builders the
  // field and ⌘D use, then rendered, so the claim "the anchor now finds its
  // target" is the engine's, not a fixture's.
  const DOC = [
    'page: { margin: 0 }',
    'sections:',
    '  body:',
    '    type: absolute',
    '    items:',
    '      - type: container',
    '        box: { x: 20, y: 20, w: 200, h: 40 }',
    '        items:',
    '          - { type: text, text: "Yes", box: { x: 0, y: 0, w: 60, h: 20 } }',
    '          - { type: ellipse, anchor: answer }',
    '',
  ].join('\n');
  const TEXT = 'sections.body.items[0].items[0]';
  const ELLIPSE = 'sections.body.items[0].items[1]';

  const render = async (editor: Editor) => {
    const outcome = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 1 });
    expect(outcome.ok).toBe(true);
    return {
      boxes: outcome.inspect?.boxes.pages.flat() ?? [],
      codes: outcome.diagnostics.items.map((d) => d.code),
    };
  };
  const index = (editor: Editor) => buildIdIndex((p) => editor.read(p));
  const write = (editor: Editor, path: string, current: string | undefined, raw: string) => {
    const edit = idEdit(index(editor), path, current, raw);
    expect(edit.ok).toBe(true);
    expect(edit.ok && editor.applyAll(edit.ops).ok).toBe(true);
  };

  it('a name the field writes is the id the box index reports, and the anchor finds it', async () => {
    const editor = Editor.create(DOC);
    expect((await render(editor)).codes).toContain('anchor_unknown_target');
    write(editor, TEXT, undefined, 'answer');
    const { boxes, codes } = await render(editor);
    expect(boxes.find((b) => b.path === TEXT)?.id).toBe('answer');
    expect(codes).not.toContain('anchor_unknown_target');
    expect(boxes.some((b) => b.path === ELLIPSE)).toBe(true);
  });

  it('a rename keeps the anchor resolving, because it follows', async () => {
    const editor = Editor.create(DOC);
    write(editor, TEXT, undefined, 'answer');
    write(editor, TEXT, 'answer', 'choice');
    const { boxes, codes } = await render(editor);
    expect(boxes.find((b) => b.path === TEXT)?.id).toBe('choice');
    expect(codes).not.toContain('anchor_unknown_target');
    expect(boxes.some((b) => b.path === ELLIPSE)).toBe(true);
  });

  it('a cleared name leaves its anchor unresolved — the effect the confirm warns of', async () => {
    const editor = Editor.create(DOC);
    write(editor, TEXT, undefined, 'answer');
    write(editor, TEXT, 'answer', '');
    const { boxes, codes } = await render(editor);
    expect(codes).toContain('anchor_unknown_target');
    expect(boxes.some((b) => b.path === ELLIPSE)).toBe(false);
  });

  it('a duplicated group circles its own copy, with no ambiguous target', async () => {
    const editor = Editor.create(DOC);
    write(editor, TEXT, undefined, 'answer');
    const batch = duplicateOps((p) => editor.read(p), 'sections.body.items', 0);
    expect(batch.ok && editor.applyAll(batch.ops).ok).toBe(true);
    const { boxes, codes } = await render(editor);
    expect(codes).not.toContain('anchor_ambiguous_target');
    expect(codes).not.toContain('anchor_unknown_target');
    expect(boxes.find((b) => b.path === 'sections.body.items[1].items[0]')?.id).toBe('answer_2');
    expect(boxes.some((b) => b.path === 'sections.body.items[1].items[1]')).toBe(true);
  });
});

describe('anchoring by picking, in a document with no names, resolved by the real engine', () => {
  // The JOIN for the two anchor pickers: the candidate list and the minted name
  // come from `ids/` (the document, no box index), and the ENGINE is what
  // resolves the anchor. Each step uses the builders the pickers themselves
  // call — `anchorCandidates` → `pickTarget` → the item's own attach ops — so
  // "the oval lands on the answer" is measured on the engine's boxes.
  const DOC = [
    'page: { margin: 0 }',
    'sections:',
    '  body:',
    '    type: absolute',
    '    items:',
    '      - { type: text, text: "Yes", box: { x: 20, y: 20, w: 60, h: 20 } }',
    '      - { type: ellipse, box: { x: 300, y: 300, w: 40, h: 16 } }',
    '      - { type: rect, box: { x: 200, y: 100, w: 40, h: 40 } }',
    '      - { type: line, from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }',
    '',
  ].join('\n');
  const TEXT = 'sections.body.items[0]';
  const ELLIPSE = 'sections.body.items[1]';
  const RECT = 'sections.body.items[2]';
  const LINE = 'sections.body.items[3]';

  const render = async (editor: Editor) => {
    const outcome = await transport.renderRaw(editor.text(), '{}', undefined, { scale: 1 });
    expect(outcome.ok).toBe(true);
    return {
      boxes: outcome.inspect?.boxes.pages.flat() ?? [],
      codes: outcome.diagnostics.items.map((d) => d.code),
    };
  };
  const pick = (editor: Editor, self: string, target: string) => {
    const index = buildIdIndex((p) => editor.read(p));
    const holder = anchorCandidates(index, self).find((h) => h.path === target);
    expect(holder?.id).toBeUndefined();
    return pickTarget(holder as IdHolder, index);
  };
  const centre = (r: { x: number; y: number; w: number; h: number }) => [
    r.x + r.w / 2,
    r.y + r.h / 2,
  ];

  it('an oval attached to an unnamed text by picking is drawn on that text', async () => {
    const editor = Editor.create(DOC);
    const picked = pick(editor, ELLIPSE, TEXT);
    const view = readEllipseAnchor((p) => editor.read(p), ELLIPSE);
    expect(editor.applyAll([...picked.ops, ...attachAnchorOps(ELLIPSE, picked.id, view)]).ok).toBe(
      true,
    );
    const { boxes, codes } = await render(editor);
    expect(codes).not.toContain('anchor_unknown_target');
    const text = boxes.find((b) => b.path === TEXT);
    const oval = boxes.find((b) => b.path === ELLIPSE);
    expect(text?.id).toBe('text_1');
    // Geometry, not "it draws": the oval left (300, 300) and is centred on the
    // text's GLYPH BAND — the inked extent the engine circles — which for a
    // left-aligned "Yes" in a 60pt box is well left of the border box's centre,
    // so centring on the border box would fail this.
    const lines = text?.text !== undefined && 'lines' in text.text ? text.text.lines : [];
    expect(lines.length).toBeGreaterThan(0);
    const left = Math.min(...lines.map((l) => l.x));
    const right = Math.max(...lines.map((l) => l.x + l.width));
    const top = Math.min(...lines.map((l) => l.emTop));
    const bottom = Math.max(...lines.map((l) => l.emBottom));
    const [ox, oy] = centre(oval?.border ?? { x: 0, y: 0, w: 0, h: 0 });
    expect(ox).toBeCloseTo((left + right) / 2, 0);
    expect(oy).toBeCloseTo((top + bottom) / 2, 0);
    const [bx] = centre(text?.border ?? { x: 0, y: 0, w: 0, h: 0 });
    expect(Math.abs(ox - bx)).toBeGreaterThan(5);
  });

  it('a line end attached to an unnamed rect by picking lands on it', async () => {
    const editor = Editor.create(DOC);
    const picked = pick(editor, LINE, RECT);
    const arm = lineArmOps(
      LINE,
      readLinePoints((p) => editor.read(p), LINE),
      'to',
      'anchor',
      picked.id,
    );
    expect(editor.applyAll([...picked.ops, ...arm]).ok).toBe(true);
    const { boxes, codes } = await render(editor);
    expect(codes).not.toContain('anchor_unknown_target');
    expect(boxes.find((b) => b.path === RECT)?.id).toBe('rect_1');
    // The default edge is `center`: the line's far corner is the rect's centre.
    const line = boxes.find((b) => b.path === LINE)?.border;
    expect(line).toBeDefined();
    expect((line?.x ?? 0) + (line?.w ?? 0)).toBeCloseTo(220, 0);
    expect((line?.y ?? 0) + (line?.h ?? 0)).toBeCloseTo(120, 0);
  });
});

describe('the vertical text & line-break section against the real engine', () => {
  const TEXT = 'sections.body.items[0]';
  const SOURCE = [
    'page: { size: A4, margin: 30 }',
    'sections:',
    '  footer:',
    '    repeat: every_page',
    '    height: 40',
    '    items:',
    '      - { type: page_number, box: { x: 0, y: 0, w: 60, h: 30 } }',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: "Ab 2026 x, y.", box: { w: 120, h: 80 } }',
    '      - { type: list, data: { key: rows }, text: "{a}", box: { w: 40, h: 60 } }',
    '      - type: table',
    '        data: { key: rows }',
    '        columns: [{ label: A, data: { key: a } }]',
    '      - type: container',
    '        box: { w: 120, h: 80 }',
    '        items: [{ type: text, text: "Ab 12" }]',
    '',
  ].join('\n');
  const PARAMS = '{"rows":[{"a":"x"}]}';
  const outcome = async (editor: Editor) => {
    const result = await transport.renderRaw(editor.text(), PARAMS, undefined, { scale: 1 });
    expect(result.ok, JSON.stringify(result.diagnostics.items)).toBe(true);
    if (result.inspect === null) throw new Error('inspect missing');
    return {
      codes: result.diagnostics.items.filter((d) => d.severity !== 'info').map((d) => d.code),
      boxes: result.inspect.boxes.pages[0],
    };
  };
  const own = (editor: Editor, path: string, key: TypesettingKey) => {
    const raw = (editor.read(path) as { style?: Record<string, unknown> }).style?.[key];
    return key === 'textCombineUpright' ? combineToken(raw) : typeof raw === 'string' ? raw : '';
  };
  const pickAll = async (editor: Editor, path: string, key: TypesettingKey) => {
    for (const option of typesettingOptions(key, undefined)) {
      const op = typesettingOp(path, key, own(editor, path, key), option);
      if (op !== null) expect(editor.apply(op).ok).toBe(true);
      const { codes } = await outcome(editor);
      // Every option the section offers parses and draws without a warning.
      expect(codes, `${path} ${key}: ${option}`).toEqual([]);
    }
  };

  it('every key and option the section writes on a text item renders warning-clean', async () => {
    const editor = Editor.create(SOURCE);
    expect((await outcome(editor)).codes).toEqual([]);
    const subject = { type: 'text', hasSpans: false, vertical: true };
    for (const key of typesettingKeys(subject, undefined)) {
      await pickAll(editor, TEXT, key);
    }
    // The sweep above ends on vertical writing, so the line-breaking family ran
    // vertical only; run it again on the horizontal text it more often styles.
    const back = typesettingOp(TEXT, 'writingMode', own(editor, TEXT, 'writingMode'), '');
    expect(back !== null && editor.apply(back).ok).toBe(true);
    for (const key of ['lineBreak', 'textSpacingTrim', 'hangingPunctuation'] as const) {
      await pickAll(editor, TEXT, key);
    }
  });

  it('vertical writing on every other surface the section offers it renders warning-clean', async () => {
    const editor = Editor.create(SOURCE);
    const paths: [string, string][] = [
      ['sections.footer.items[0]', 'page_number'],
      ['sections.body.items[1]', 'list'],
      ['sections.body.items[2]', 'table'],
      ['sections.body.items[3]', 'container'],
    ];
    for (const [path, type] of paths) {
      const subject = { type, hasSpans: false, vertical: true };
      for (const key of typesettingKeys(subject, undefined)) {
        await pickAll(editor, path, key);
      }
    }
  });

  it('turning a text vertical changes what the engine draws (the positive control)', async () => {
    const editor = Editor.create(SOURCE);
    const metrics = async () => {
      const text = (await outcome(editor)).boxes.find((b) => b.path === TEXT)?.text;
      return text === undefined ? 'none' : 'columns' in text ? 'columns' : 'lines';
    };
    expect(await metrics()).toBe('lines');
    const op = typesettingOp(TEXT, 'writingMode', '', 'vertical_rl');
    expect(op !== null && editor.apply(op).ok).toBe(true);
    expect(await metrics()).toBe('columns');
  });
});

describe('the ruby section against the real engine', () => {
  // Japanese bases and readings need a Japanese face; the shared transport is
  // set up for en-US, whose font packs have none (every glyph would warn).
  let ja: EngineTransport;
  beforeAll(() => {
    ja = createWasmTransport(preparedEngine(wasmModule, 'ja-JP'));
  });
  const PLAIN = 'sections.body.items[0]';
  const SUBJECTS: [string, string][] = [
    [PLAIN, 'plain horizontal'],
    ['sections.body.items[1]', 'vertical'],
    ['sections.body.items[2]', 'spans'],
    ['sections.body.items[3]', 'bound'],
  ];
  const SOURCE = [
    'page: { size: A4, margin: 30 }',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: "吾輩は猫である 2026", box: { w: 300 }, style: { lineHeight: 2 } }',
    '      - type: text',
    '        text: "吾輩は猫である 2026"',
    '        box: { w: 80, h: 260 }',
    '        style: { writingMode: vertical_rl, lineHeight: 2 }',
    '      - type: text',
    '        spans: [{ text: "吾輩は" }, { text: "猫である 2026", style: { fontWeight: bold } }]',
    '        box: { w: 300 }',
    '        style: { lineHeight: 2 }',
    '      - { type: text, data: { key: name }, box: { w: 300 }, style: { lineHeight: 2 } }',
    '',
  ].join('\n');
  const PARAMS = '{"name":"吾輩は猫である 2026"}';
  const render = async (editor: Editor) => {
    const result = await ja.renderRaw(editor.text(), PARAMS, undefined, { scale: 1 });
    expect(result.ok, JSON.stringify(result.diagnostics.items)).toBe(true);
    return {
      codes: result.diagnostics.items.filter((d) => d.severity !== 'info').map((d) => d.code),
      rgba: result.pages[0].rgba,
    };
  };
  const apply = (editor: Editor, op: Op | null) => {
    expect(op).not.toBeNull();
    expect(editor.apply(op as Op).ok).toBe(true);
  };
  const view = (editor: Editor, path: string) => readRuby((p) => editor.read(p), path);
  const same = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  it('adds, edits and removes readings on every text shape, warning-clean', async () => {
    const editor = Editor.create(SOURCE);
    expect((await render(editor)).codes).toEqual([]);
    for (const [path, shape] of SUBJECTS) {
      apply(editor, addRubyOp(path, view(editor, path), '吾輩', 'わがはい'));
      // A digit-only base must reach the engine as a STRING (a bare 2026 fails
      // the parse). Its reading is short enough to fit over four digits.
      apply(editor, addRubyOp(path, view(editor, path), '2026', 'ねん'));
      expect((await render(editor)).codes, `${shape} added`).toEqual([]);
      apply(editor, editRubyOp(path, view(editor, path).rows[0], 'text', 'わがはい!'));
      apply(editor, editRubyOp(path, view(editor, path).rows[1], 'base', '猫'));
      expect((await render(editor)).codes, `${shape} edited`).toEqual([]);
    }
    for (const [path, shape] of SUBJECTS) {
      for (const preset of [...RUBY_TEXT_SIZE_PRESETS, '2mm']) {
        apply(editor, rubySizeOp(path, view(editor, path), preset));
        expect((await render(editor)).codes, `${shape} size ${preset}`).toEqual([]);
      }
    }
    for (const [path, shape] of SUBJECTS) {
      while (view(editor, path).rows.length > 0) {
        apply(editor, removeRubyOp(path, view(editor, path), 0));
      }
      expect(editor.read(path), shape).not.toHaveProperty('ruby');
    }
    expect((await render(editor)).codes).toEqual([]);
  });

  it('the engine reads what the section writes (the positive controls)', async () => {
    const editor = Editor.create(SOURCE);
    const bare = (await render(editor)).rgba;
    apply(editor, addRubyOp(PLAIN, view(editor, PLAIN), '吾輩', 'わがはい'));
    const ruby = (await render(editor)).rgba;
    // The readings draw: the page is not what it was without them.
    expect(same(bare, ruby)).toBe(false);
    apply(editor, rubySizeOp(PLAIN, view(editor, PLAIN), '4'));
    // ...and the size reaches them.
    expect(same(ruby, (await render(editor)).rgba)).toBe(false);
    // A base the drawn text does not contain is reported by the engine, so a
    // clean run above means the bases MATCHED rather than were ignored.
    apply(editor, addRubyOp(PLAIN, view(editor, PLAIN), '犬', 'いぬ'));
    expect((await render(editor)).codes).toEqual(['ruby_base_not_found']);
  });
});

describe('the text circle section against the real engine', () => {
  // The labels are Japanese, so the transport needs a Japanese face (the shared
  // en-US one has none and every glyph would warn).
  let ja: EngineTransport;
  beforeAll(() => {
    ja = createWasmTransport(preparedEngine(wasmModule, 'ja-JP'));
  });
  const PLAIN = 'sections.body.items[0]';
  const SUBJECTS: [string, string][] = [
    [PLAIN, 'plain'],
    ['sections.body.items[1]', 'spans'],
    ['sections.body.items[2]', 'bound text'],
  ];
  const SOURCE = [
    'page: { size: A4, margin: 30 }',
    'styles:',
    '  red: { borderColor: "#cc0000" }',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: 現金, box: { w: 120 } }',
    '      - { type: text, spans: [{ text: カー }, { text: ド, style: { fontWeight: bold } }], box: { w: 120 } }',
    '      - { type: text, data: { key: label }, box: { w: 120 } }',
    '      - type: text',
    '        text: 縦書き',
    '        box: { w: 40, h: 120 }',
    '        style: { writingMode: vertical_rl }',
    '',
  ].join('\n');
  const render = async (editor: Editor, params = '{"label":"振込","pay":"cash"}') => {
    const result = await ja.renderRaw(editor.text(), params, undefined, { scale: 1 });
    expect(result.ok, JSON.stringify(result.diagnostics.items)).toBe(true);
    return {
      codes: result.diagnostics.items.filter((d) => d.severity !== 'info').map((d) => d.code),
      rgba: result.pages[0].rgba,
    };
  };
  const apply = (editor: Editor, op: Op | null) => {
    expect(op).not.toBeNull();
    expect(editor.apply(op as Op).ok).toBe(true);
  };
  const applyAll = (editor: Editor, ops: readonly Op[]) => {
    expect(ops.length).toBeGreaterThan(0);
    expect(editor.applyAll(ops).ok).toBe(true);
  };
  const view = (editor: Editor, path: string) => readTextMark((p) => editor.read(p), path);
  const bind = (editor: Editor, path: string, equals: string) => {
    const markPath = view(editor, path).markPath;
    applyAll(editor, repointMarkOps(markPath, 'pay', 'string', [], false, ''));
    apply(editor, setMarkEqualsOp(markPath, equals, 'string'));
  };
  const same = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  it('turns a circle on, binds, styles and removes it on every text shape, warning-clean', async () => {
    const editor = Editor.create(SOURCE);
    expect((await render(editor)).codes).toEqual([]);
    for (const [path, shape] of SUBJECTS) {
      applyAll(editor, textMarkPresenceOps(path, view(editor, path), 'always'));
      expect((await render(editor)).codes, `${shape} always`).toEqual([]);
      applyAll(editor, textMarkPresenceOps(path, view(editor, path), 'bound'));
      bind(editor, path, 'cash');
      expect((await render(editor)).codes, `${shape} bound`).toEqual([]);
      for (const preset of [...MARK_PADDING_PRESETS, '2', '1mm', '30%', '']) {
        apply(editor, markPaddingOp(view(editor, path), preset));
        expect((await render(editor)).codes, `${shape} padding ${preset}`).toEqual([]);
      }
      const markPath = view(editor, path).markPath;
      apply(editor, strokeWidthOp(markPath, '2'));
      apply(editor, strokeColorOp(markPath, '#0055aa'));
      apply(editor, fillOp(markPath, '#eeeeee'));
      expect(readShapeStyle((p) => editor.read(p), markPath).strokeWidth).toBe('2');
      apply(editor, styleNamesOp(markPath, ['red']));
      expect((await render(editor)).codes, `${shape} styled`).toEqual([]);
      applyAll(editor, textMarkPresenceOps(path, view(editor, path), 'always'));
      expect((await render(editor)).codes, `${shape} unbound`).toEqual([]);
      applyAll(editor, textMarkPresenceOps(path, view(editor, path), 'none'));
      expect(editor.read(path), shape).not.toHaveProperty('mark');
    }
    expect((await render(editor)).codes).toEqual([]);
  });

  it('the engine reads what the section writes (the positive controls)', async () => {
    const editor = Editor.create(SOURCE);
    const bare = (await render(editor)).rgba;
    applyAll(editor, textMarkPresenceOps(PLAIN, view(editor, PLAIN), 'always'));
    const circled = (await render(editor)).rgba;
    // The circle draws: the page is not what it was without it.
    expect(same(bare, circled)).toBe(false);
    // Bound to a field: drawn on a match, absent otherwise.
    applyAll(editor, textMarkPresenceOps(PLAIN, view(editor, PLAIN), 'bound'));
    bind(editor, PLAIN, 'cash');
    expect(same((await render(editor)).rgba, circled)).toBe(true);
    expect(same((await render(editor, '{"label":"振込","pay":"card"}')).rgba, bare)).toBe(true);
    // Unbinding keeps the circle.
    applyAll(editor, textMarkPresenceOps(PLAIN, view(editor, PLAIN), 'always'));
    expect(same((await render(editor)).rgba, circled)).toBe(true);
    // The clearance and the outline reach it.
    apply(editor, markPaddingOp(view(editor, PLAIN), '1em'));
    const padded = (await render(editor)).rgba;
    expect(same(padded, circled)).toBe(false);
    apply(editor, strokeColorOp(view(editor, PLAIN).markPath, '#0055aa'));
    expect(same((await render(editor)).rgba, padded)).toBe(false);
  });

  it('a circle on vertical text is reported, not drawn', async () => {
    const editor = Editor.create(SOURCE);
    const VERTICAL = 'sections.body.items[3]';
    const bare = (await render(editor)).rgba;
    applyAll(editor, textMarkPresenceOps(VERTICAL, view(editor, VERTICAL), 'always'));
    const result = await render(editor);
    expect(result.codes).toEqual(['vertical_text_unsupported']);
    expect(same(result.rgba, bare)).toBe(true);
  });
});

describe('creating spans from a plain text against the real engine', () => {
  // Japanese text needs a Japanese face (the shared en-US transport has none).
  let ja: EngineTransport;
  beforeAll(() => {
    ja = createWasmTransport(preparedEngine(wasmModule, 'ja-JP'));
  });
  const HORIZONTAL = 'sections.body.items[0]';
  const VERTICAL = 'sections.body.items[1]';
  const SOURCE = [
    'page: { size: A4, margin: 30 }',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: 合計金額, box: { w: 200 } }',
    '      - type: text',
    '        text: 令和12年',
    '        box: { w: 40, h: 160 }',
    '        style: { writingMode: vertical_rl }',
    '',
  ].join('\n');
  const outcome = async (editor: Editor) => {
    const result = await ja.renderRaw(editor.text(), '{}', undefined, { scale: 1 });
    expect(result.ok, JSON.stringify(result.diagnostics.items)).toBe(true);
    if (result.inspect === null) throw new Error('inspect missing');
    return {
      codes: result.diagnostics.items.filter((d) => d.severity !== 'info').map((d) => d.code),
      boxes: result.inspect.boxes.pages[0],
      rgba: result.pages[0].rgba,
    };
  };
  const run = (content: string, marks: RunMarks = NO_MARKS): SerializedRun => ({
    sourceIndex: 0,
    kind: 'text',
    content,
    marks,
    linked: false,
  });
  /** Commit `runs` over the plain item at `path`, as the flow surface does. */
  const convert = (
    editor: Editor,
    path: string,
    oldText: string,
    runs: readonly SerializedRun[],
  ) => {
    const ops =
      plainFlowCommitOps({
        read: (p) => editor.read(p),
        path,
        oldText,
        runs,
        pending: [],
      }) ?? [];
    expect(ops.length).toBeGreaterThan(0);
    expect(editor.applyAll(ops).ok).toBe(true);
  };
  const border = (boxes: readonly PlacedBox[], path: string) =>
    boxes.find((b) => b.path === path)?.border;
  const same = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  const BOLD: RunMarks = { ...NO_MARKS, bold: true };

  it('converts warning-clean, at the SAME place and size as the plain item', async () => {
    const editor = Editor.create(SOURCE);
    const before = await outcome(editor);
    expect(before.codes).toEqual([]);
    convert(editor, HORIZONTAL, '合計金額', [run('合計'), run('金額', BOLD)]);
    const after = await outcome(editor);
    // No `span_content_conflict` (the `text:` went), no `empty_span`.
    expect(after.codes).toEqual([]);
    expect(border(after.boxes, HORIZONTAL)).toEqual(border(before.boxes, HORIZONTAL));
    // The positive control: the bold fragment reached the page.
    expect(same(after.rgba, before.rgba)).toBe(false);
  });

  it('draws a line break inside a fragment as a second line', async () => {
    const editor = Editor.create(SOURCE);
    convert(editor, HORIZONTAL, '合計金額', [run('合計\n'), run('金額', BOLD)]);
    const text = (await outcome(editor)).boxes.find((b) => b.path === HORIZONTAL)?.text;
    expect(text !== undefined && 'lines' in text ? text.lines.length : 0).toBe(2);
  });

  it('sets tate-chu-yoko on ONE fragment of a vertical text — and the engine draws it', async () => {
    const off = Editor.create(SOURCE);
    convert(off, VERTICAL, '令和12年', [
      run('令和'),
      run('12', { ...NO_MARKS, combine: 'none' }),
      run('年'),
    ]);
    const upright = Editor.create(SOURCE);
    convert(upright, VERTICAL, '令和12年', [
      run('令和'),
      run('12', { ...NO_MARKS, combine: 'all' }),
      run('年'),
    ]);
    const digits = Editor.create(SOURCE);
    convert(digits, VERTICAL, '令和12年', [
      run('令和'),
      run('12', { ...NO_MARKS, combine: 'digits2' }),
      run('年'),
    ]);
    const [a, b, c] = [await outcome(off), await outcome(upright), await outcome(digits)];
    for (const result of [a, b, c]) {
      expect(result.codes).toEqual([]);
    }
    expect(same(a.rgba, b.rgba)).toBe(false);
    // The digits map the builder writes parses and combines the same two digits.
    expect(same(b.rgba, c.rgba)).toBe(true);
  });

  it('leaves tate-chu-yoko inert — and silent — on a horizontal text', async () => {
    const plain = Editor.create(SOURCE);
    convert(plain, HORIZONTAL, '合計金額', [run('合計'), run('金額', BOLD)]);
    const marked = Editor.create(SOURCE);
    convert(marked, HORIZONTAL, '合計金額', [
      run('合計'),
      run('金額', { ...BOLD, combine: 'all' }),
    ]);
    const [a, b] = [await outcome(plain), await outcome(marked)];
    expect(b.codes).toEqual([]);
    expect(same(a.rgba, b.rgba)).toBe(true);
  });
});

describe("a fragment's binding and a split's metrics, through the real engine", () => {
  const ITEM = 'sections.body.items[0]';
  const BOUND = `${ITEM}.spans[1]`;
  const DEFS = [
    'type: object',
    'properties:',
    '  amount: { type: number }',
    '  shop: { type: string }',
    '  note: { type: string }',
    '  lines:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        sku: { type: string }',
    '',
  ].join('\n');
  const PARAMS = JSON.stringify({
    amount: 1234567,
    shop: 'Shojiku Store Main Street',
    lines: [{ sku: 'A' }],
  });
  const flow = (items: readonly string[]) =>
    ['page: { size: A4, margin: 30 }', 'sections:', '  body:', '    type: flow', '    items:']
      .concat(items, '')
      .join('\n');
  const SOURCE = flow([
    '      - type: text',
    '        box: { w: 400 }',
    '        spans:',
    '          - { text: "Total " }',
    '          - { data: { key: amount } }',
  ]);
  /** The first drawn line of the first box at `path`, and the warning codes. */
  const draw = async (editor: Editor, path = ITEM) => {
    const result = await transport.renderRaw(editor.text(), PARAMS, DEFS, { scale: 1 });
    expect(result.ok, JSON.stringify(result.diagnostics.items)).toBe(true);
    const text = result.inspect?.boxes.pages.flat().find((b) => b.path === path)?.text;
    return {
      codes: result.diagnostics.items.filter((d) => d.severity !== 'info').map((d) => d.code),
      width: text !== undefined && 'lines' in text ? (text.lines[0]?.width ?? 0) : 0,
    };
  };

  it('draws the format the inspector writes onto a bound fragment', async () => {
    const editor = Editor.create(SOURCE);
    const before = await draw(editor);
    expect(editor.apply(formatOp(BOUND, 'symbol')).ok).toBe(true);
    expect(editor.read(`${BOUND}.data`)).toEqual({ key: 'amount', format: 'symbol' });
    const after = await draw(editor);
    expect(after.codes).toEqual(before.codes);
    // The currency symbol widens the same digits.
    expect(after.width).toBeGreaterThan(before.width);
  });

  it('draws the blank placeholder when the fragment value is absent', async () => {
    const editor = Editor.create(SOURCE);
    expect(editor.apply(bindingKeyOp(BOUND, 'note')).ok).toBe(true);
    const blank = await draw(editor);
    expect(editor.apply(placeholderOp(BOUND, '(no note given)')).ok).toBe(true);
    const shown = await draw(editor);
    expect(shown.width).toBeGreaterThan(blank.width + 20);
  });

  it('resolves a fragment picked at document scope inside a repeat cell from the top level', async () => {
    const CELL = 'sections.body.items[0].cell.items[0]';
    const editor = Editor.create(
      flow([
        '      - type: repeat',
        '        data: { key: lines }',
        '        cell:',
        '          box: { w: 400, h: 40 }',
        '          items:',
        '            - type: text',
        '              box: { w: 400 }',
        '              spans:',
        '                - { text: "at " }',
        '                - { data: { key: sku } }',
      ]),
    );
    const row = await draw(editor, CELL);
    const read = (path: string) => editor.read(path);
    expect(editor.applyAll(bindingPickOps(read, `${CELL}.spans[1]`, 'shop', true)).ok).toBe(true);
    expect(editor.read(`${CELL}.spans[1].data`)).toEqual({ key: 'shop', scope: 'document' });
    const top = await draw(editor, CELL);
    expect(top.codes).toEqual(row.codes);
    // "at Shojiku Store Main Street" is far wider than "at A".
    expect(top.width).toBeGreaterThan(row.width + 50);
  });

  it('keeps the look of a split fragment — the same line width as before the split', async () => {
    // The geometry claim behind carrying the metrics: marking part of a
    // fragment with a COLOUR (which moves no glyph) must leave the line
    // exactly as wide. The control is the split as it was written before the
    // metrics were carried — the new halves at the block's size — which does
    // move it.
    const sized = flow([
      '      - type: text',
      '        box: { w: 400 }',
      '        spans:',
      '          - { text: "Total amount due", style: { fontSize: 16, letterSpacing: 1 } }',
    ]);
    const editor = Editor.create(sized);
    const whole = await draw(editor);
    const spans = editor.read(`${ITEM}.spans`) as readonly unknown[];
    const run = (content: string, marks: RunMarks = NO_MARKS): SerializedRun => ({
      sourceIndex: 0,
      kind: 'text',
      content,
      marks,
      linked: false,
    });
    const ops = spanCommitOps(
      (path) => editor.read(path),
      ITEM,
      planRuns(narrowRuns(spans), [
        run('Total '),
        run('amount', { ...NO_MARKS, color: '#cc0000' }),
        run(' due'),
      ]),
    );
    expect(editor.applyAll(ops).ok).toBe(true);
    const split = await draw(editor);
    expect(split.codes).toEqual(whole.codes);
    expect(split.width).toBeCloseTo(whole.width, 3);

    const control = Editor.create(
      flow([
        '      - type: text',
        '        box: { w: 400 }',
        '        spans:',
        '          - { text: "Total ", style: { fontSize: 16, letterSpacing: 1 } }',
        '          - { text: amount, style: { color: "#cc0000" } }',
        '          - { text: " due" }',
      ]),
    );
    expect((await draw(control)).width).toBeLessThan(whole.width - 10);
  });
});

describe('a field’s declared display formats in the placement picker, through the real wasm', () => {
  // The picker reads the list from the definitions text itself (the palette
  // walk), heads its rows with it, and drops what the list makes the engine
  // refuse — a mirror of `validate/bindings.rs`. This crosses the join: the
  // GUI's own parse of the list, its mirror of the rule, and the engine's
  // validate over every row it offers AND every catalog row it dropped.
  const defs = (list: string) =>
    [
      'type: object',
      'properties:',
      `  issued: { type: string, format: date, displayFormats: ${list} }`,
      `  amount: { type: number, format: currency, displayFormats: ${list} }`,
      '',
    ].join('\n');
  const placed = (key: string, format: string) =>
    [
      'version: 0.1.0',
      'formats:',
      '  stamp: { type: date, pattern: "yyyy.MM.dd" }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      `      - { type: text, data: { key: ${key}, format: ${JSON.stringify(format)} } }`,
      '',
    ].join('\n');
  const PARAMS = '{"issued":"2026-11-03","amount":1234.5}';
  const refusals = async (engine: EngineTransport, key: string, format: string, list: string) =>
    (await engine.validate(placed(key, format), PARAMS, defs(list))).items.filter(
      (d) => d.code === 'unknown_format',
    ).length;

  it('offers only picks the engine accepts, and drops exactly the ones it refuses', async () => {
    for (const locale of ['en-US', 'ja-JP']) {
      const engine = createWasmTransport(preparedEngine(wasmModule, locale));
      const catalog = await engine.formatCatalog?.(placed('issued', 'stamp'), []);
      if (catalog === undefined) {
        throw new Error('the wasm transport answers the format catalog');
      }
      for (const list of ['[ { id: long, label: Long date }, { id: foo } ]', '[ { id: "" } ]']) {
        await checkList(engine, catalog, locale, list);
      }
    }
  });

  async function checkList(
    engine: EngineTransport,
    catalog: FormatCatalog,
    locale: string,
    list: string,
  ) {
    for (const [key, type] of [
      ['issued', 'date'],
      ['amount', 'currency'],
    ] as const) {
      const field = pickerOptions(readDefinitionsView(defs(list)), null, PARAMS).find(
        (option) => option.key === key,
      );
      expect(field?.type, locale).toBe(type);
      const offered = formatOptions(['stamp'], type, undefined, catalog, field?.displayFormats);
      // Declared first, in the order written, with the author's label — and
      // a list of one empty id restricts the field with no row of its own.
      const head = offered.slice(0, 2).map((row) => [row.spelling, row.label]);
      if (list.includes('long')) {
        expect(head, locale).toEqual([
          ['long', 'Long date'],
          ['foo', undefined],
        ]);
      } else {
        expect(
          offered.some((row) => row.spelling === ''),
          locale,
        ).toBe(false);
      }
      for (const row of offered) {
        expect(await refusals(engine, key, row.spelling, list), `${locale} ${row.spelling}`).toBe(
          0,
        );
      }
      // Everything the same picker offers with NO list, minus what it offers
      // now, is what the list dropped — and each is a pick the engine refuses.
      const before = formatOptions(['stamp'], type, undefined, catalog).map((r) => r.spelling);
      const dropped = before.filter((s) => !offered.some((row) => row.spelling === s));
      if (type === 'date') {
        expect(dropped.length, locale).toBeGreaterThan(0);
      }
      for (const spelling of dropped) {
        expect(await refusals(engine, key, spelling, list), `${locale} ${spelling}`).toBe(1);
      }
    }
  }

  it('refuses the render over a pick the list leaves out, and renders a declared one', async () => {
    const list = '[ { id: long } ]';
    const refused = await transport.renderRaw(placed('issued', 'compact'), PARAMS, defs(list), {
      scale: 1,
    });
    expect(refused.ok).toBe(false);
    expect(refused.pages).toHaveLength(0);
    expect(refused.diagnostics.items.map((d) => `${d.severity}:${d.code}`)).toContain(
      'error:unknown_format',
    );
    const declared = await transport.renderRaw(placed('issued', 'long'), PARAMS, defs(list), {
      scale: 1,
    });
    expect(declared.ok).toBe(true);
    expect(declared.pages).toHaveLength(1);
  });
});

// The template's own name and version, edited from the document-properties
// section, reach the engine as the engine reads them: the name is the PDF
// title when no `document.title` is set (receipt-us carries `name: receipt_us`
// and no title, so its committed PDF says `/Title(receipt_us)` — the positive
// control), a set title still wins, and a version written as TEXT is accepted.
describe('template name and version against the real engine', () => {
  const pdfText = (bytes: Uint8Array | undefined) =>
    new TextDecoder('latin1').decode(bytes ?? new Uint8Array());

  async function renderedTitle(source: string): Promise<string> {
    const outcome = await transport.renderPdf?.(source, params(), definitions());
    expect(outcome?.ok).toBe(true);
    return pdfText(outcome?.pdf);
  }

  it('titles the PDF with the name, and an edited name moves the title', async () => {
    expect(await renderedTitle(template())).toContain('/Title(receipt_us)');
    const editor = Editor.create(template());
    const op = identityOp('name', 'receipt_us', 'renamed_in_designer');
    expect(op).not.toBeNull();
    expect(editor.apply(op as Op).ok).toBe(true);
    const title = await renderedTitle(editor.text());
    expect(title).toContain('/Title(renamed_in_designer)');
    expect(title).not.toContain('receipt_us');
  });

  it('lets a set document title win over the name', async () => {
    const editor = Editor.create(template());
    expect(editor.apply(metaTextOp('title', '', 'Shop receipt') as Op).ok).toBe(true);
    const title = await renderedTitle(editor.text());
    expect(title).toContain('/Title(Shop receipt)');
    expect(title).not.toContain('/Title(receipt_us)');
  });

  it('accepts a version written as text, numeric-looking or not', async () => {
    const codes = (items: readonly { readonly code: string }[]) => items.map((d) => d.code).sort();
    const baseline = codes((await transport.validate(template(), params(), definitions())).items);
    for (const raw of ['2', '1.0', '0.3.0-beta']) {
      const editor = Editor.create(template());
      expect(editor.apply(identityOp('version', '', raw) as Op).ok).toBe(true);
      const edited = editor.text();
      // Written as TEXT: re-reading the file gives back the typed string.
      expect(Editor.create(edited).read('version')).toBe(raw);
      // ...and the engine says nothing about it the untouched file did not.
      const diags = await transport.validate(edited, params(), definitions());
      expect(codes(diags.items)).toEqual(baseline);
    }
  });

  it('refuses a version shape it cannot read — the control for the case above', async () => {
    // receipt-us already carries `version: 0.1.0`, so the shape is REPLACED in
    // place — prepending one would fail as a duplicate key instead.
    const source = template();
    const refused = source.replace(/^version: .*$/m, 'version: [1]');
    expect(refused).not.toBe(source);
    const diags = await transport.validate(refused, params(), definitions());
    expect(diags.items.some((d) => d.code === 'parse_error')).toBe(true);
  });
});
