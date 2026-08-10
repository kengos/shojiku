// Renders the tech page's SBOM sentence from the committed inventories under
// sbom/, and splices it between generated-section markers — the same
// no-transcription rule the README gallery follows, for the same reason.
//
// The numbers had been transcribed by hand, in two locales, and two of the
// three were wrong: the page advertised 235 components for the engine and 258
// for the gui where the artifacts held 255 and 243. Nothing could catch it,
// because no gate reads prose. Generating the sentence makes `make site-check`
// the thing that catches it.

export const START = "<!-- sbom:generated:start (regenerate with `make site-data`) -->";
export const END = "<!-- sbom:generated:end -->";

/** One committed inventory: its display name and how many components it records. */
export type SbomCount = { readonly name: string; readonly components: number };

/** The inventories the sentence names, in the order it names them. */
export const INVENTORIES = ["engine", "gui", "sdk-js"] as const;

/**
 * Number of components a CycloneDX document records.
 *
 * Deliberately counts the whole `components` array rather than filtering to
 * `library`: that is what a reader gets by counting the committed file, which
 * is the only number the sentence can honestly claim.
 */
export function countComponents(json: string): number {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || !("components" in parsed)) {
    throw new Error("not a CycloneDX document: no components array");
  }
  const { components } = parsed as { components: unknown };
  if (!Array.isArray(components)) throw new Error("not a CycloneDX document: components is not an array");
  return components.length;
}

const REPO_SBOM = "https://github.com/kengos/shojiku/tree/main/sbom";

/** How the English sentence refers to each inventory. */
const EN_SUBJECT: Record<string, string> = { engine: "the engine", gui: "the gui" };

/** The English bullet. The unit word rides the FIRST count only — "255
 * components for the engine, 243 for the gui" — so the list reads as a
 * sentence rather than ending in a stray noun. */
export function renderEn(counts: readonly SbomCount[]): string {
  const list = counts
    .map((c, i) => `${c.components}${i === 0 ? " components" : ""} for ${EN_SUBJECT[c.name] ?? c.name}`)
    .join(", ");
  return [
    `- **A CycloneDX SBOM is committed to the repository**`,
    `  ([sbom/](${REPO_SBOM})): currently ${list}. Each is generated from the`,
    `  lockfile itself and records that lockfile's sha256, so you can check`,
    `  which resolution it describes — and CI fails if a lockfile moves`,
    `  without its inventory catching up`,
  ].join("\n");
}

/** The Japanese bullet. Japanese is the SOURCE language for the site, so
 * this is written as Japanese rather than translated from renderEn — the
 * first draft was a literal translation and it moved the claim: "記録した
 * 資源のsha256" reads as the sha256 of the recorded components, when what
 * is recorded is the sha256 of the lockfile ITSELF, which is the whole
 * verifiability point. "在庫" is likewise a dictionary rendering of
 * "inventory" that nobody uses for an SBOM. */
export function renderJa(counts: readonly SbomCount[]): string {
  const list = counts.map((c) => `${c.name} ${c.components}`).join(" / ");
  return (
    `- **CycloneDX SBOMをリポジトリにコミット**しています（[sbom/](${REPO_SBOM})）。` +
    `現在は${list}コンポーネントです。ロックファイル自体をスキャンして生成し、` +
    `そのロックファイルのsha256を記録しているので、どの解決結果を写したものかが後から確かめられます。` +
    `ロックファイルが動いたのにSBOMが追いついていなければCIが落ちます`
  );
}

/**
 * Splice the generated block between the markers. Requires both markers, in
 * order — a page without them fails loudly instead of no-oping, which is how
 * the README generator learned to behave.
 */
export function spliceSection(page: string, generated: string, what: string): string {
  const s = page.indexOf(START);
  const e = page.indexOf(END);
  if (s === -1 || e === -1) throw new Error(`${what}: sbom markers not found`);
  if (s >= e) throw new Error(`${what}: sbom markers out of order`);
  return page.slice(0, s + START.length) + "\n" + generated + "\n" + page.slice(e);
}
