// The reference-page demos: one runnable document per feature page, shown
// live on the page it documents. Pure over text so the node integration suite
// can drive the real engine with it and the browser component can fetch it.

/** Where the demo documents live, relative to the repo root. */
export const DEMO_DIR = "site/src/demos/";

export interface Demo {
  name: string;
  template: string;
  params: string;
  definitions?: string;
  /** The raw expect.json, when the demo declares anything. */
  expect?: string;
}

/** The engine capability keys a demo's wire needs. The site serves a RELEASED
 * engine on purpose, while the reference documents HEAD, so a page can
 * legitimately document syntax the page's own engine cannot parse. Gating on
 * capability KEYS rather than the version string is what makes that
 * survivable: both binaries report the same version today, and the registry
 * is append-only, so a key the engine does not list is a feature it does not
 * have — no release-date table to maintain. */
export function requiredCapabilities(json: string | undefined): string[] {
  if (json === undefined) return [];
  try {
    const doc = JSON.parse(json) as { requires?: unknown };
    if (!Array.isArray(doc.requires)) return [];
    return doc.requires.filter((c): c is string => typeof c === "string");
  } catch {
    return [];
  }
}

/** The capability key list out of an engine's `capabilities()` JSON. An
 * unreadable payload yields none, which degrades every gated demo to its
 * static form — the safe direction, since the alternative is calling an
 * engine that will reject the document. */
export function capabilityKeys(capabilitiesJson: string): string[] {
  try {
    const doc = JSON.parse(capabilitiesJson) as { capabilities?: unknown };
    if (!Array.isArray(doc.capabilities)) return [];
    return doc.capabilities.filter((c): c is string => typeof c === "string");
  } catch {
    return [];
  }
}

/** Whether THIS engine can run the demo at all. */
export function runnableHere(required: readonly string[], engineKeys: readonly string[]): boolean {
  return required.every((k) => engineKeys.includes(k));
}

/** The codes a demo is SUPPOSED to emit. Absent or malformed means none —
 * a demo can only ever declare FEWER diagnostics than it emits by accident,
 * so a broken file fails the suite rather than silencing it. */
export function expectedDiagnostics(json: string | undefined): string[] {
  if (json === undefined) return [];
  try {
    const doc = JSON.parse(json) as { diagnostics?: unknown };
    if (!Array.isArray(doc.diagnostics)) return [];
    return doc.diagnostics.filter((c): c is string => typeof c === "string");
  } catch {
    return [];
  }
}

/** Whether a demo needs the lazy JP font tier. Read from the document's own
 * locale rather than a list kept beside it — a demo that switches locale
 * cannot forget to update its gate. */
export function isJapaneseDemo(template: string): boolean {
  return /locale:\s*ja-JP\b/.test(template);
}
