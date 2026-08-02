// Knob clamping + template generation (string-level; the rendered proof is
// the integration suite's).
import { describe, expect, it } from "vitest";
import {
  clampFlexKnobs,
  clampFlexWidthKnobs,
  clampFontKnobs,
  clampGridKnobs,
  clampTextKnobs,
  FLEX_KNOB_DEFAULTS,
  FLEX_WIDTH_KNOB_DEFAULTS,
  flexDemoTemplate,
  flexWidthDemoTemplate,
  FONT_KNOB_DEFAULTS,
  fontDemoTemplate,
  GRID_KNOB_DEFAULTS,
  gridDemoTemplate,
  TEXT_KNOB_DEFAULTS,
  textDemoTemplate,
} from "./playground.ts";

describe("textDemoTemplate", () => {
  it("writes every knob into the style block and sizes the box from the font", () => {
    const t = textDemoTemplate({ textAlign: "center", fontSize: 20, lineHeight: 1.5, letterSpacing: "0.1em" });
    expect(t).toContain("textAlign: center");
    expect(t).toContain("fontSize: 20");
    expect(t).toContain('letterSpacing: "0.1em"');
    // a numeric spacing is a bare pt number — a quoted "0" is a parse error
    expect(textDemoTemplate(TEXT_KNOB_DEFAULTS)).toMatch(/letterSpacing: 0$/m);
    // 20 × 1.5 × 4 lines + 8 = 128
    expect(t).toContain("h: 128");
  });
});

describe("gridDemoTemplate", () => {
  it("keeps writingMode at item level and swaps the box axis per mode", () => {
    const v = gridDemoTemplate(GRID_KNOB_DEFAULTS);
    expect(v).toMatch(/^ {6}- type: char_grid$/m);
    expect(v).toMatch(/^ {8}writingMode: vertical_rl$/m);
    expect(v).not.toMatch(/style: \{[^}]*writingMode/);
    const h = gridDemoTemplate({ writingMode: "horizontal_tb", cellSize: 20 });
    expect(h).toContain("box: { w: 208, h: 26 }");
    expect(v).toContain("box: { w: 28, h: 228 }");
  });
});

describe("flexDemoTemplate", () => {
  it("emits N widthless cards in one row container with the gap in box:", () => {
    const t = flexDemoTemplate({ columns: 3, gap: 8 });
    expect(t.match(/- type: container/g)?.length).toBe(4); // the row + 3 cards
    expect(t).toContain('box: { w: "100%", direction: row, gap: 8 }');
    expect(t).toContain("text: Column 3");
    // the equal-split idiom is the ABSENCE of w on the cards
    expect(t).toContain("box: { h: 96, padding: 8 }");
  });
});

describe("flexWidthDemoTemplate", () => {
  it("gives only the first card a width; the other two stay widthless", () => {
    const t = flexWidthDemoTemplate({ width: 120 });
    expect(t.match(/- type: container/g)?.length).toBe(4); // the row + 3 cards
    expect(t).toContain("box: { w: 120, h: 96, padding: 8 }");
    expect(t.match(/box: \{ h: 96, padding: 8 \}/g)?.length).toBe(2);
    expect(t).toContain("text: w:120");
    expect(t.match(/text: auto/g)?.length).toBe(2);
  });
});

describe("fontDemoTemplate", () => {
  it("keeps the JP line on the locale default and swaps only the Latin line", () => {
    const t = fontDemoTemplate({ family: "noto-sans-mono", weight: "bold", fontSize: 20 });
    expect(t.match(/fontFamily:/g)?.length).toBe(1);
    expect(t).toContain("fontFamily: noto-sans-mono");
    expect(t.match(/fontWeight: bold/g)?.length).toBe(2);
    // box height follows fontSize x 1.4 + 6 = 34
    expect(t.match(/h: 34/g)?.length).toBe(2);
  });
});

describe("clamping", () => {
  it("clamps hostile text knobs to the bounds", () => {
    expect(
      clampTextKnobs({ textAlign: "justify" as never, fontSize: 900, lineHeight: 0, letterSpacing: "x); DROP" }),
    ).toEqual({ textAlign: "left", fontSize: 48, lineHeight: 1, letterSpacing: "0" });
    expect(clampTextKnobs({ textAlign: "right", fontSize: Number.NaN, lineHeight: Number.NaN, letterSpacing: "0.2em" }))
      .toEqual({ textAlign: "right", fontSize: 12, lineHeight: 1.4, letterSpacing: "0.2em" });
  });

  it("clamps hostile grid knobs", () => {
    expect(clampGridKnobs({ writingMode: "diagonal" as never, cellSize: 5000 })).toEqual({
      writingMode: "vertical_rl",
      cellSize: 36,
    });
    expect(clampGridKnobs({ writingMode: "horizontal_tb", cellSize: Number.NaN })).toEqual({
      writingMode: "horizontal_tb",
      cellSize: 22,
    });
  });

  it("clamps hostile flex knobs", () => {
    expect(clampFlexKnobs({ columns: 99, gap: -5 })).toEqual({ columns: 4, gap: 0 });
    expect(clampFlexKnobs({ columns: Number.NaN, gap: Number.NaN })).toEqual({ columns: 3, gap: 12 });
  });

  it("clamps hostile flex-width knobs", () => {
    expect(clampFlexWidthKnobs({ width: 5000 })).toEqual({ width: 180 });
    expect(clampFlexWidthKnobs({ width: 1 })).toEqual({ width: 60 });
    expect(clampFlexWidthKnobs({ width: 80.6 })).toEqual({ width: 81 });
    expect(clampFlexWidthKnobs({ width: Number.NaN })).toEqual({ width: 80 });
  });

  it("clamps hostile font knobs", () => {
    expect(clampFontKnobs({ family: "comic-sans" as never, weight: "900" as never, fontSize: 900 })).toEqual({
      family: "biz-udp-gothic",
      weight: "normal",
      fontSize: 32,
    });
    expect(clampFontKnobs({ family: "noto-sans-mono", weight: "bold", fontSize: Number.NaN })).toEqual({
      family: "noto-sans-mono",
      weight: "bold",
      fontSize: 14,
    });
    expect(clampFontKnobs({ family: "biz-udp-gothic", weight: "normal", fontSize: 2 }).fontSize).toBe(8);
  });

  it("defaults are already in bounds", () => {
    expect(clampTextKnobs(TEXT_KNOB_DEFAULTS)).toEqual(TEXT_KNOB_DEFAULTS);
    expect(clampGridKnobs(GRID_KNOB_DEFAULTS)).toEqual(GRID_KNOB_DEFAULTS);
    expect(clampFlexKnobs(FLEX_KNOB_DEFAULTS)).toEqual(FLEX_KNOB_DEFAULTS);
    expect(clampFlexWidthKnobs(FLEX_WIDTH_KNOB_DEFAULTS)).toEqual(FLEX_WIDTH_KNOB_DEFAULTS);
    expect(clampFontKnobs(FONT_KNOB_DEFAULTS)).toEqual(FONT_KNOB_DEFAULTS);
  });
});
