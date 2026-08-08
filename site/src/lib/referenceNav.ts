// The /reference/ sidebar: a tree of the WIRE's own shape, not a second
// taxonomy. Each page declares which file and group it belongs to and which
// keys it owns (its `reference:` front-matter); the item group's ORDER comes
// from the catalog's own item list, so the order readers see is the parser's.
import type { Group, ReferencePage } from "./reference.ts";

export interface NavLink {
  text: string;
  link: string;
}

export interface NavSection {
  text: string;
  items: (NavLink | { text: string; items: NavLink[] })[];
}

/** The two files the reference documents, plus the cross-cutting concepts.
 * A section with ONE group renders its links flat. */
const SECTIONS: { text: string; groups: { group: Group; text: string }[] }[] = [
  {
    text: "templates.yml",
    groups: [
      { group: "root", text: "root" },
      { group: "item", text: "item" },
      { group: "item-keys", text: "item keys" },
      { group: "layout", text: "layout modes" },
    ],
  },
  { text: "definitions.yml", groups: [{ group: "definitions", text: "" }] },
  { text: "Concepts", groups: [{ group: "concept", text: "" }] },
];

/** The item `type` discriminators, in the order the catalog lists them — the
 * parser's order, which is also the order the reference index tabulates. */
export function catalogItemTypes(catalog: unknown): string[] {
  const item = (catalog as { $defs?: Record<string, { oneOf?: unknown[] }> })?.$defs?.Item;
  if (item?.oneOf === undefined) return [];
  return item.oneOf
    .map((v) => (v as { properties?: { type?: { const?: unknown } } })?.properties?.type?.const)
    .filter((t): t is string => typeof t === "string");
}

/** A page's tree entries. `keys` may carry an anchor (`property#types-and-format`)
 * so a single page can own more than one place in the tree. */
function links(page: ReferencePage, base: string): NavLink[] {
  return page.meta.keys.map((k) => {
    const hash = k.indexOf("#");
    const text = hash === -1 ? k : k.slice(0, hash);
    const anchor = hash === -1 ? "" : k.slice(hash);
    return { text, link: `${base}${page.stem}${anchor}` };
  });
}

function ordered(pages: ReferencePage[], group: Group, itemTypes: readonly string[], base: string): NavLink[] {
  const inGroup = pages.filter((p) => p.meta.group === group);
  if (group === "item") {
    // Derived, not declared: sort by where the key sits in the catalog's item
    // list. A page owning two keys (form_marks: ellipse, checkbox) therefore
    // lands in two places without carrying two order numbers.
    return inGroup
      .flatMap((p) => links(p, base))
      .sort((a, b) => itemTypes.indexOf(a.text) - itemTypes.indexOf(b.text));
  }
  return [...inGroup]
    .sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0))
    .flatMap((p) => links(p, base));
}

/** The sidebar for one locale's /reference/**. */
export function buildSidebar(pages: ReferencePage[], catalog: unknown, base: string): NavSection[] {
  const itemTypes = catalogItemTypes(catalog);
  return SECTIONS.map((s) => ({
    text: s.text,
    items:
      s.groups.length === 1
        ? ordered(pages, s.groups[0]!.group, itemTypes, base)
        : s.groups.map((g) => ({ text: g.text, items: ordered(pages, g.group, itemTypes, base) })),
  }));
}

/** Every page the tree reaches, for the coverage gate: the tree must show
 * every feature page, and a page it never reaches is one no reader can find. */
export function treeStems(sidebar: NavSection[]): string[] {
  const out: string[] = [];
  const take = (l: NavLink): void => {
    const stem = l.link.slice(l.link.lastIndexOf("/") + 1).split("#")[0];
    if (stem !== undefined && !out.includes(stem)) out.push(stem);
  };
  for (const s of sidebar) {
    for (const it of s.items) {
      if ("items" in it) it.items.forEach(take);
      else take(it);
    }
  }
  return out;
}
