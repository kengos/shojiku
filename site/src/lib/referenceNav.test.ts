import { describe, expect, it } from "vitest";
import { buildSidebar, catalogItemTypes, treeStems } from "./referenceNav.ts";
import type { Group, ReferencePage } from "./reference.ts";

const page = (stem: string, group: Group, keys: string[], order?: number): ReferencePage => ({
  stem,
  title: stem,
  body: "",
  meta: { group, order, keys, shapes: [], summary: "s" },
});

const CATALOG = {
  $defs: {
    Item: {
      oneOf: [
        { properties: { type: { const: "text" } } },
        { properties: { type: { const: "rect" } } },
        { properties: { type: { const: "ellipse" } } },
        { properties: { type: { const: "checkbox" } } },
        { properties: {} },
      ],
    },
  },
};

describe("catalogItemTypes", () => {
  it("reads the discriminators in the catalog's own order", () => {
    expect(catalogItemTypes(CATALOG)).toEqual(["text", "rect", "ellipse", "checkbox"]);
  });

  it("yields none when the catalog has no Item union", () => {
    expect(catalogItemTypes({ $defs: {} })).toEqual([]);
    expect(catalogItemTypes({})).toEqual([]);
    expect(catalogItemTypes(null)).toEqual([]);
  });
});

describe("buildSidebar", () => {
  const pages = [
    page("template", "root", ["template"], 1),
    page("page", "root", ["page"], 2),
    page("text", "item", ["text"]),
    page("rect", "item", ["rect"]),
    page("form_marks", "item", ["ellipse", "checkbox"]),
    page("box", "item-keys", ["box"], 1),
    page("flow", "layout", ["flow"], 1),
    page("definitions", "definitions", ["root", "property#types-and-format"], 1),
    page("length", "concept", ["length"], 1),
    page("README", "index", []),
  ];

  it("nests templates.yml into its four groups and flattens the single-group sections", () => {
    const [tpl, defs, concepts] = buildSidebar(pages, CATALOG, "/reference/");
    expect(tpl?.text).toBe("templates.yml");
    expect(tpl?.items.map((i) => ("items" in i ? i.text : i.text))).toEqual(["root", "item", "item keys", "layout modes"]);
    expect(defs?.items).toEqual([
      { text: "root", link: "/reference/definitions" },
      { text: "property", link: "/reference/definitions#types-and-format" },
    ]);
    expect(concepts?.items).toEqual([{ text: "length", link: "/reference/length" }]);
  });

  it("orders the item group by the catalog, so one page can hold two places", () => {
    const items = buildSidebar(pages, CATALOG, "/reference/")[0]?.items[1];
    expect(items !== undefined && "items" in items ? items.items : []).toEqual([
      { text: "text", link: "/reference/text" },
      { text: "rect", link: "/reference/rect" },
      { text: "ellipse", link: "/reference/form_marks" },
      { text: "checkbox", link: "/reference/form_marks" },
    ]);
  });

  it("orders every other group by the declared order", () => {
    const root = buildSidebar([page("b", "root", ["b"], 2), page("a", "root", ["a"], 1)], CATALOG, "/reference/")[0]?.items[0];
    expect(root !== undefined && "items" in root ? root.items.map((l) => l.text) : []).toEqual(["a", "b"]);
  });

  it("treats a page with no declared order as first rather than dropping it", () => {
    const root = buildSidebar([page("b", "root", ["b"], 1), page("a", "root", ["a"])], CATALOG, "/reference/")[0]?.items[0];
    expect(root !== undefined && "items" in root ? root.items.map((l) => l.text) : []).toEqual(["a", "b"]);
  });

  it("leaves the index page out of the tree", () => {
    expect(JSON.stringify(buildSidebar(pages, CATALOG, "/reference/"))).not.toContain("README");
  });

  it("prefixes every link with the locale base", () => {
    const flat = JSON.stringify(buildSidebar(pages, CATALOG, "/ja/reference/"));
    expect(flat).toContain('"/ja/reference/text"');
    expect(flat).not.toContain('"/reference/');
  });
});

describe("treeStems", () => {
  it("collects every page the tree reaches, nested or flat, without repeats", () => {
    const pages = [page("text", "item", ["text"]), page("form_marks", "item", ["ellipse", "checkbox"]), page("length", "concept", ["length"], 1)];
    expect(treeStems(buildSidebar(pages, CATALOG, "/reference/")).sort()).toEqual(["form_marks", "length", "text"]);
  });

  it("strips the anchor so one page counts once", () => {
    const pages = [page("definitions", "definitions", ["root", "property#types-and-format"], 1)];
    expect(treeStems(buildSidebar(pages, CATALOG, "/ja/reference/"))).toEqual(["definitions"]);
  });
});

describe("ordering with no declared order", () => {
  it("keeps a group whose pages all omit order", () => {
    const pages = [page("a", "root", ["a"]), page("b", "root", ["b"]), page("c", "root", ["c"])];
    const root = buildSidebar(pages, CATALOG, "/reference/")[0]?.items[0];
    expect(root !== undefined && "items" in root ? root.items.map((l) => l.text) : []).toEqual(["a", "b", "c"]);
  });
});
