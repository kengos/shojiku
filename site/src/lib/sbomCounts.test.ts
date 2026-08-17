import { describe, expect, it } from "vitest";
import { END, START, countComponents, renderEn, renderJa, spliceSection } from "./sbomCounts.ts";

const counts = [
  { name: "engine", components: 255 },
  { name: "gui", components: 243 },
  { name: "sdk-js", components: 127 },
];

describe("countComponents", () => {
  it("counts every entry in the components array", () => {
    expect(countComponents('{"components":[{"name":"a"},{"name":"b"},{"name":"c"}]}')).toBe(3);
  });

  it("counts an empty inventory as zero rather than failing", () => {
    expect(countComponents('{"components":[]}')).toBe(0);
  });

  it("counts the file component too, because that is what counting the file gives", () => {
    expect(countComponents('{"components":[{"type":"library"},{"type":"file"}]}')).toBe(2);
  });

  it("rejects a document with no components array", () => {
    expect(() => countComponents('{"bomFormat":"CycloneDX"}')).toThrow(/no components array/);
  });

  it("rejects a components key that is not an array", () => {
    expect(() => countComponents('{"components":{"name":"a"}}')).toThrow(/not an array/);
  });

  it("rejects a JSON document that is not an object", () => {
    expect(() => countComponents("[]")).toThrow(/no components array/);
  });

  it("rejects null, which typeof calls an object", () => {
    expect(() => countComponents("null")).toThrow(/no components array/);
  });
});

describe("renderEn", () => {
  it("names each inventory with its count, in order, with the unit word only once", () => {
    expect(renderEn(counts)).toContain("255 components for the engine, 243 for the gui, 127 for sdk-js.");
  });

  it("does not leave the list ending in a stray noun", () => {
    expect(renderEn(counts)).not.toContain("for sdk-js\n  components");
    expect(renderEn(counts)).not.toContain("sdk-js components");
  });

  it("falls back to the raw name for an inventory it has no phrasing for", () => {
    expect(renderEn([{ name: "capi", components: 7 }])).toContain("7 components for capi.");
  });

  it("states what the generation guarantees, not just the numbers", () => {
    expect(renderEn(counts)).toContain("records that lockfile's sha256");
    expect(renderEn(counts)).toContain("refreshed at each release");
  });

  // The page used to promise "CI fails if a lockfile moves without its
  // inventory catching up". That stopped being true when the drift check
  // moved to release time, and a claim that a GATE protects the reader is
  // the worst kind to leave standing — it tells them not to check. Asserted
  // as an absence so it cannot drift back in.
  it("does not claim CI keeps the inventories in step with the lockfiles", () => {
    expect(renderEn(counts)).not.toContain("CI fails");
    expect(renderJa(counts)).not.toContain("CIが落ちます");
  });
});

describe("renderJa", () => {
  it("names each inventory with its count", () => {
    expect(renderJa(counts)).toContain("engine 255 / gui 243 / sdk-js 127");
  });

  it("says the sha256 is the LOCKFILE's, not the recorded components'", () => {
    expect(renderJa(counts)).toContain("そのロックファイルのsha256を記録");
  });

  it("says the inventories are refreshed per release, so staleness is stated rather than hidden", () => {
    expect(renderJa(counts)).toContain("更新はリリースごと");
  });

  it("does not call the SBOM 在庫, a dictionary rendering nobody uses for one", () => {
    expect(renderJa(counts)).not.toContain("在庫");
  });
});

describe("spliceSection", () => {
  const page = `intro\n${START}\nOLD\n${END}\noutro\n`;

  it("replaces only what sits between the markers", () => {
    expect(spliceSection(page, "NEW", "tech.md")).toBe(`intro\n${START}\nNEW\n${END}\noutro\n`);
  });

  it("is idempotent — splicing the same content twice changes nothing", () => {
    const once = spliceSection(page, "NEW", "tech.md");
    expect(spliceSection(once, "NEW", "tech.md")).toBe(once);
  });

  it("fails loudly when the start marker is absent, rather than no-oping", () => {
    expect(() => spliceSection(`intro\n${END}\n`, "NEW", "tech.md")).toThrow(/tech.md: sbom markers not found/);
  });

  it("fails loudly when the end marker is absent", () => {
    expect(() => spliceSection(`intro\n${START}\n`, "NEW", "tech.md")).toThrow(/sbom markers not found/);
  });

  it("fails when the markers are out of order", () => {
    expect(() => spliceSection(`${END}\nx\n${START}\n`, "NEW", "ja/tech.md")).toThrow(/ja\/tech.md: sbom markers out of order/);
  });

  it("names the page it was given, so a two-locale failure says which one", () => {
    expect(() => spliceSection("no markers", "NEW", "ja/tech.md")).toThrow(/^ja\/tech.md: /);
  });
});
