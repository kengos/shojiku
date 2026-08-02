// The site's font tiering (docs/TODO.md § HP1): which faces of which packs
// ship to the live renderer, in which tier. Whole packs are too heavy for a
// marketing page (biz-ud is 18 MB, ipamj-mincho 45 MB > the 25 MiB Pages
// file cap), so each tier ships a SUBSET manifest naming only the faces it
// carries — a valid pack as far as the engine is concerned, kept next to the
// pack's license file.
import { parse, stringify } from "yaml";

/** immediate: fetched before the first render (en-US examples).
 *  lazy-ja: fetched behind the explicit "load Japanese fonts" click. */
export const TIERS = [
  {
    tier: "immediate",
    pack: "noto-sans",
    faces: ["noto-sans", "noto-sans-bold"],
    license: "OFL.txt",
  },
  {
    tier: "lazy-ja",
    pack: "biz-ud",
    // ja-JP's default family is biz-udp-gothic (the P pair) — shipping the
    // non-P pair would leave the locale's default face missing.
    faces: ["biz-udp-gothic", "biz-udp-gothic-bold"],
    license: "BIZ_UD_Gothic_OFL.txt",
  },
  {
    // In ja-JP's uses list, so a legal fontFamily there — the playground's
    // family-contrast demo rides it (~1.2 MB on top of BIZ UD).
    tier: "lazy-ja",
    pack: "noto-sans-mono",
    faces: ["noto-sans-mono", "noto-sans-mono-bold"],
    license: "OFL.txt",
  },
] as const;

export type Tier = (typeof TIERS)[number];

interface ManifestFace {
  id: string;
  file: string;
  sha256: string;
  family?: string;
  weight?: string;
  style?: string;
}

export interface SubsetResult {
  manifestText: string;
  files: string[];
}

/** Reduce a pack manifest to the named faces. Throws when a requested face id
 * is absent — a renamed face upstream must fail the build, not ship a tier
 * with a silently missing family. */
export function subsetManifest(manifestText: string, faceIds: readonly string[]): SubsetResult {
  const doc = parse(manifestText) as {
    version: number;
    license: string;
    redistributable: boolean;
    faces: ManifestFace[];
  };
  if (!Array.isArray(doc.faces)) throw new Error("pack manifest has no faces list");
  const byId = new Map(doc.faces.map((f) => [f.id, f]));
  const picked = faceIds.map((id) => {
    const f = byId.get(id);
    if (!f) throw new Error(`face ${id} not found in pack manifest`);
    return f;
  });
  return {
    manifestText: stringify({
      version: doc.version,
      license: doc.license,
      redistributable: doc.redistributable,
      faces: picked,
    }),
    files: picked.map((f) => f.file),
  };
}

/** The Cloudflare Pages hard per-file limit. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
