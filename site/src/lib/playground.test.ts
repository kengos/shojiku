// Knob clamping + template generation (string-level; the rendered proof is
// the integration suite's).
import { describe, expect, it } from "vitest";
import {
  clampGridKnobs,
  clampTextKnobs,
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

  it("defaults are already in bounds", () => {
    expect(clampTextKnobs(TEXT_KNOB_DEFAULTS)).toEqual(TEXT_KNOB_DEFAULTS);
    expect(clampGridKnobs(GRID_KNOB_DEFAULTS)).toEqual(GRID_KNOB_DEFAULTS);
  });
});
