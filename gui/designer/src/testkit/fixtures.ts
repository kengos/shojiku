// Shared Designer-level test fixtures: the tiny template sources and the
// fake render outcomes (pages + inspect boxes) the composed-Designer suites
// feed the mock transport. Test substrate only — excluded from coverage.
import type { RenderOutcome } from '../engine/transport';
import type { Diagnostic, Diagnostics } from '../engine/types';

export const SOURCE = [
  'version: 0.1.0',
  'sections:',
  '  body:',
  '    items:',
  '      - type: text',
  '        text: hello',
  '',
].join('\n');

export const BOX = { x: 0, y: 0, w: 8, h: 8 };

export function outcome(diagnostics: Diagnostics): RenderOutcome {
  return outcomeWith(['sections.body.items[0]'], diagnostics);
}

/** A render outcome whose box index carries exactly the given paths (each box
 * clickable by its path aria-label). */
export function outcomeWith(
  paths: readonly string[],
  diagnostics: Diagnostics = { items: [] },
): RenderOutcome {
  return {
    ok: true,
    pages: [{ width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }],
    inspect: {
      engine: { version: '0', capabilities: [], builtinLocales: [] },
      document: {},
      boxes: {
        pages: [paths.map((path) => ({ path, border: BOX, content: BOX }))],
      },
      margin: [0, 0, 0, 0],
    },
    diagnostics,
  };
}

/** A render outcome whose two text items' DRAWN lines overlap — the shape a
 * widened sheet produces when a centred full-width heading re-centres on top
 * of neighbours pinned in pt. Their BOXES are identical in every outcome
 * above; only the line metrics tell the two situations apart. */
export function outcomeColliding(): RenderOutcome {
  const line = (x: number) => ({
    lines: [{ x, width: 80, baseline: 60, capTop: 43, emTop: 41, emBottom: 63 }],
  });
  return {
    ok: true,
    pages: [{ width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }],
    inspect: {
      engine: { version: '0', capabilities: [], builtinLocales: [] },
      document: {},
      boxes: {
        pages: [
          [
            {
              path: 'sections.body.items[0]',
              id: 'title',
              border: BOX,
              content: BOX,
              text: line(380),
            },
            {
              path: 'sections.body.items[1]',
              id: 'meta',
              border: BOX,
              content: BOX,
              text: line(430),
            },
          ],
        ],
      },
      margin: [0, 0, 0, 0],
    },
    diagnostics: { items: [] },
  };
}

/** A three-item flow body for the canvas reorder tests. */
export const THREE_ITEMS = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: first',
  '      - type: text',
  '        text: second',
  '      - type: text',
  '        text: third',
  '',
].join('\n');

/** A render outcome whose boxes stack vertically (items[n] at y = n*40,
 * 100×30) so canvas drop-slot math has real geometry to chew on. */
export function outcomeStacked(paths: readonly string[]): RenderOutcome {
  return {
    ok: true,
    pages: [{ width: 200, height: 200, rgba: new Uint8Array(200 * 200 * 4) }],
    inspect: {
      engine: { version: '0', capabilities: [], builtinLocales: [] },
      document: {},
      boxes: {
        pages: [
          paths.map((path, i) => ({
            path,
            border: { x: 0, y: i * 40, w: 100, h: 30 },
            content: { x: 0, y: i * 40, w: 100, h: 30 },
          })),
        ],
      },
      margin: [0, 0, 0, 0],
    },
    diagnostics: { items: [] },
  };
}

/** A three-item ABSOLUTE body (movable items) for the multi-select / align
 * tests, with varied x/y so an align/distribute produces a real change. */
export const ABS_VARIED = [
  'sections:',
  '  body:',
  '    type: absolute',
  '    items:',
  '      - type: rect',
  '        box: { x: 10, y: 10, w: 40, h: 20 }',
  '      - type: rect',
  '        box: { x: 80, y: 50, w: 40, h: 20 }',
  '      - type: rect',
  '        box: { x: 40, y: 90, w: 40, h: 20 }',
  '',
].join('\n');

/** Inspect geometry matching ABS_VARIED' authored positions (margin 0). */
export function outcomeAbs(paths: readonly string[]): RenderOutcome {
  const geo = [
    { x: 10, y: 10, w: 40, h: 20 },
    { x: 80, y: 50, w: 40, h: 20 },
    { x: 40, y: 90, w: 40, h: 20 },
  ];
  return {
    ok: true,
    pages: [{ width: 200, height: 200, rgba: new Uint8Array(200 * 200 * 4) }],
    inspect: {
      engine: { version: '0', capabilities: [], builtinLocales: [] },
      document: {},
      boxes: {
        pages: [paths.map((path, i) => ({ path, border: geo[i], content: geo[i] }))],
      },
      margin: [0, 0, 0, 0],
    },
    diagnostics: { items: [] },
  };
}

export const STYLE_DIAG: Diagnostic = {
  severity: 'warning',
  code: 'undefined_style_name',
  category: 'style',
  message: 'styleName `heading` is not defined',
  args: { name: 'heading' },
  path: 'sections.body.items[0]',
};
