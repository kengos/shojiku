import { describe, expect, it } from "vitest";
import { capabilityKeys, DEMO_DIR, expectedDiagnostics, isJapaneseDemo, requiredCapabilities, runnableHere } from "./demos.ts";

describe("expectedDiagnostics", () => {
  it("reads the declared code list", () => {
    expect(expectedDiagnostics('{"diagnostics":["text_overflow"]}')).toEqual(["text_overflow"]);
  });

  it("treats an absent file as declaring nothing", () => {
    expect(expectedDiagnostics(undefined)).toEqual([]);
  });

  it("treats a missing or non-array key as declaring nothing", () => {
    expect(expectedDiagnostics("{}")).toEqual([]);
    expect(expectedDiagnostics('{"diagnostics":"text_overflow"}')).toEqual([]);
  });

  it("drops non-string entries rather than trusting them", () => {
    expect(expectedDiagnostics('{"diagnostics":["a",7,null,"b"]}')).toEqual(["a", "b"]);
  });

  it("declares nothing when the file is not JSON — a broken file cannot silence the gate", () => {
    expect(expectedDiagnostics("not json {")).toEqual([]);
  });
});

describe("isJapaneseDemo", () => {
  it("is true when the document selects the ja-JP locale", () => {
    expect(isJapaneseDemo('defaults: { locale: ja-JP }\n')).toBe(true);
    expect(isJapaneseDemo("defaults:\n  locale: ja-JP\n")).toBe(true);
  });

  it("is false for every other locale", () => {
    expect(isJapaneseDemo('defaults: { locale: en-US }\n')).toBe(false);
    expect(isJapaneseDemo('defaults: { locale: ja-JPX }\n')).toBe(false);
    expect(isJapaneseDemo("sections:\n  body:\n")).toBe(false);
  });
});

describe("DEMO_DIR", () => {
  it("is repo-relative and ends with a separator", () => {
    expect(DEMO_DIR).toBe("site/src/demos/");
  });
});

describe("requiredCapabilities", () => {
  it("reads the declared key list", () => {
    expect(requiredCapabilities('{"requires":["box.flexBasis"]}')).toEqual(["box.flexBasis"]);
  });

  it("declares nothing for an absent, keyless, non-array or unparseable file", () => {
    expect(requiredCapabilities(undefined)).toEqual([]);
    expect(requiredCapabilities("{}")).toEqual([]);
    expect(requiredCapabilities('{"requires":"box.flexBasis"}')).toEqual([]);
    expect(requiredCapabilities("{oops")).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(requiredCapabilities('{"requires":["a",1]}')).toEqual(["a"]);
  });
});

describe("capabilityKeys", () => {
  it("reads the engine's own key list", () => {
    expect(capabilityKeys('{"version":"0.1.0","capabilities":["box.flex","line.length"]}')).toEqual(["box.flex", "line.length"]);
  });

  it("yields none for a keyless, non-array or unparseable payload", () => {
    expect(capabilityKeys("{}")).toEqual([]);
    expect(capabilityKeys('{"capabilities":3}')).toEqual([]);
    expect(capabilityKeys("")).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(capabilityKeys('{"capabilities":["a",null]}')).toEqual(["a"]);
  });
});

describe("runnableHere", () => {
  it("is true when the engine lists every required key", () => {
    expect(runnableHere(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("is true when the demo requires nothing", () => {
    expect(runnableHere([], [])).toBe(true);
  });

  it("is false when one key is missing", () => {
    expect(runnableHere(["a", "z"], ["a", "b"])).toBe(false);
  });
});
