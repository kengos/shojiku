// The playground's knob → template generation. Each demo GENERATES a small
// complete template from typed knob values (never string-patching user
// YAML), so the shown source and the rendered page cannot diverge.

export interface TextKnobs {
  textAlign: "left" | "center" | "right";
  fontSize: number;
  lineHeight: number;
  letterSpacing: string;
}

export const TEXT_KNOB_DEFAULTS: TextKnobs = {
  textAlign: "left",
  fontSize: 12,
  lineHeight: 1.4,
  letterSpacing: "0",
};

const SAMPLE =
  "The engine lays this paragraph out deterministically: same input, same bytes, on every machine.";

/** A one-paragraph en-US page exercising the text style knobs. The box
 * height follows fontSize × lineHeight × 4 lines so a knob change cannot
 * push the demo into text_overflow (the wire gotcha the reference warns
 * about). */
export function textDemoTemplate(k: TextKnobs): string {
  const boxH = Math.ceil(k.fontSize * k.lineHeight * 4) + 8;
  return [
    'version: "0.1.0"',
    "page: { size: A5, margin: 24 }",
    "defaults: { locale: en-US }",
    "sections:",
    "  body:",
    "    type: flow",
    "    items:",
    "      - type: text",
    `        box: { w: "100%", h: ${boxH} }`,
    `        text: "${SAMPLE}"`,
    "        style:",
    `          textAlign: ${k.textAlign}`,
    `          fontSize: ${k.fontSize}`,
    `          lineHeight: ${k.lineHeight}`,
    // A bare number is pt; only unit-suffixed values are strings (a quoted
    // "0" is a parse error — lengths reject plain-number STRINGS).
    `          letterSpacing: ${/^-?\d+(\.\d+)?$/.test(k.letterSpacing) ? k.letterSpacing : `"${k.letterSpacing}"`}`,
    "      - type: rect",
    `        box: { w: "100%", h: 0.8 }`,
    '        style: { backgroundColor: "#1a3c6e" }',
    "",
  ].join("\n");
}

export interface GridKnobs {
  writingMode: "horizontal_tb" | "vertical_rl";
  cellSize: number;
}

export const GRID_KNOB_DEFAULTS: GridKnobs = {
  writingMode: "vertical_rl",
  cellSize: 22,
};

/** The genkoyoshi char_grid demo (ja-JP — gated behind the JP font tier).
 * `writingMode` sits at ITEM level on purpose: as a style property it parses
 * and silently stays horizontal (the documented wire gotcha). */
export function gridDemoTemplate(k: GridKnobs): string {
  const chars = 10;
  const span = chars * k.cellSize + 8;
  const box =
    k.writingMode === "vertical_rl"
      ? `{ w: ${k.cellSize + 6}, h: ${span} }`
      : `{ w: ${span}, h: ${k.cellSize + 6} }`;
  return [
    'version: "0.1.0"',
    "page: { size: A5, margin: 24 }",
    "defaults: { locale: ja-JP }",
    "sections:",
    "  body:",
    "    type: flow",
    "    items:",
    "      - type: char_grid",
    `        box: ${box}`,
    "        text: 縦書きも、そのまま。",
    `        writingMode: ${k.writingMode}`,
    `        grid: { charsPerLine: ${chars}, lines: 1, cellSize: ${k.cellSize} }`,
    '        style: { borderColor: "#a8674f" }',
    "",
  ].join("\n");
}

/** Knob bounds, enforced before generation so a hostile value cannot reach
 * the template (S2 belt beside the engine's own validation). */
export function clampTextKnobs(k: TextKnobs): TextKnobs {
  const align = ["left", "center", "right"].includes(k.textAlign) ? k.textAlign : "left";
  return {
    textAlign: align,
    fontSize: Math.min(48, Math.max(6, Number.isFinite(k.fontSize) ? k.fontSize : 12)),
    lineHeight: Math.min(3, Math.max(1, Number.isFinite(k.lineHeight) ? k.lineHeight : 1.4)),
    letterSpacing: /^-?\d+(\.\d+)?(em|pt|)$/.test(k.letterSpacing) ? k.letterSpacing : "0",
  };
}

export function clampGridKnobs(k: GridKnobs): GridKnobs {
  return {
    writingMode: k.writingMode === "horizontal_tb" ? "horizontal_tb" : "vertical_rl",
    cellSize: Math.min(36, Math.max(10, Number.isFinite(k.cellSize) ? k.cellSize : 22)),
  };
}

export interface FlexKnobs {
  columns: number;
  gap: number;
}

export const FLEX_KNOB_DEFAULTS: FlexKnobs = { columns: 3, gap: 12 };

/** The layout demo: one flex row whose children carry NO width — the
 * engine's "N equal columns" idiom is exactly that omission. Cards are
 * bordered containers so the split and the gap read at a glance. */
export function flexDemoTemplate(k: FlexKnobs): string {
  const cards: string[] = [];
  for (let i = 1; i <= k.columns; i++) {
    cards.push(
      ...[
        "      - type: container",
        "        box: { h: 96, padding: 8 }",
        '        style: { borderWidth: 0.8, borderColor: "#1a3c6e" }',
        "        items:",
        "          - type: text",
        '            box: { w: "100%", h: 16 }',
        `            text: Column ${i}`,
        "            style: { fontSize: 11, textAlign: center }",
      ],
    );
  }
  return [
    'version: "0.1.0"',
    "page: { size: A5, margin: 24 }",
    "defaults: { locale: en-US }",
    "sections:",
    "  body:",
    "    type: flow",
    "    items:",
    "      - type: text",
    '        box: { w: "100%", h: 18 }',
    "        text: Children without a width split the leftover equally.",
    "        style: { fontSize: 10 }",
    "      - type: container",
    // direction/gap live INSIDE box: on the wire (item-level is a parse error)
    `        box: { w: "100%", direction: row, gap: ${k.gap} }`,
    "        items:",
    ...cards.map((l) => "    " + l),
  ].join("\n") + "\n";
}

export function clampFlexKnobs(k: FlexKnobs): FlexKnobs {
  return {
    columns: Math.min(4, Math.max(1, Number.isFinite(k.columns) ? Math.round(k.columns) : 3)),
    gap: Math.min(24, Math.max(0, Number.isFinite(k.gap) ? k.gap : 12)),
  };
}

export interface FontKnobs {
  family: "biz-udp-gothic" | "noto-sans-mono";
  weight: "normal" | "bold";
  fontSize: number;
}

export const FONT_KNOB_DEFAULTS: FontKnobs = {
  family: "biz-udp-gothic",
  weight: "normal",
  fontSize: 14,
};

/** The font demo (ja-JP, gated behind the JP tier): a Japanese specimen on
 * the locale's default family and a Latin specimen whose family the knob
 * swaps. Only families in ja-JP's `uses` list are legal here — that
 * constraint is the demo's caption, not a limitation to hide. */
export function fontDemoTemplate(k: FontKnobs): string {
  const lineH = Math.ceil(k.fontSize * 1.4) + 6;
  return [
    'version: "0.1.0"',
    "page: { size: A5, margin: 24 }",
    "defaults: { locale: ja-JP }",
    "sections:",
    "  body:",
    "    type: flow",
    "    gap: 10",
    "    items:",
    "      - type: text",
    `        box: { w: "100%", h: ${lineH} }`,
    "        text: 書けば、帳票になる。0123456789",
    `        style: { fontWeight: ${k.weight}, fontSize: ${k.fontSize} }`,
    "      - type: text",
    `        box: { w: "100%", h: ${lineH} }`,
    "        text: Shojiku AaBbCc 0123456789",
    `        style: { fontFamily: ${k.family}, fontWeight: ${k.weight}, fontSize: ${k.fontSize} }`,
    "",
  ].join("\n");
}

export function clampFontKnobs(k: FontKnobs): FontKnobs {
  return {
    family: k.family === "noto-sans-mono" ? "noto-sans-mono" : "biz-udp-gothic",
    weight: k.weight === "bold" ? "bold" : "normal",
    fontSize: Math.min(32, Math.max(8, Number.isFinite(k.fontSize) ? k.fontSize : 14)),
  };
}
