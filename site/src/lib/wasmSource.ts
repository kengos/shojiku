// The provenance pin for the browser engine the site serves. `site/.data/wasm`
// holds a RELEASED build, and `site/.data/wasm-source.json` records which
// release it is plus each file's sha256. `make site:check` verifies the
// committed bytes against that RECORD — it never rebuilds, so the check says
// the same thing on every host architecture, and the only way to move the
// site's engine is `make site:wasm-release`, which points it at another
// released build. The alternative (comparing against a fresh local build) is
// what made the homepage track unreleased code.
import { createHash } from "node:crypto";

export interface WasmSource {
  /** The engine release these bytes were built from, e.g. `0.1.0`. */
  version: string;
  /** File name → sha256, lowercase hex. */
  files: Record<string, string>;
}

const WASM_SOURCE_PATH = "site/.data/wasm-source.json";

const VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;
// The keys index into site/.data/wasm — a name that is not a plain basename
// would reach outside it.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(what: string): never {
  throw new Error(`${WASM_SOURCE_PATH}: ${what}`);
}

/** sha256 of one file's bytes, lowercase hex — the digest the record carries. */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Parses the record, refusing anything it cannot pin on. */
export function parseWasmSource(text: string): WasmSource {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    fail(`not valid JSON (${String(e)})`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("expected a JSON object");
  const record = raw as Record<string, unknown>;
  const version = record.version;
  if (typeof version !== "string" || !VERSION.test(version)) fail("`version` must be a MAJOR.MINOR.PATCH string");
  const files = record.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) fail("`files` must be a JSON object");
  const entries = Object.entries(files as Record<string, unknown>);
  if (entries.length === 0) fail("`files` records no file");
  const pinned: Record<string, string> = {};
  for (const [name, digest] of entries) {
    if (!FILE_NAME.test(name)) fail(`\`files\` key ${JSON.stringify(name)} is not a plain file name`);
    if (typeof digest !== "string" || !SHA256.test(digest)) {
      fail(`\`files.${name}\` must be a lowercase sha256 hex digest`);
    }
    pinned[name] = digest;
  }
  return { version, files: pinned };
}

/** The record's committed form: key-sorted, so a refresh diffs minimally. */
export function renderWasmSource(source: WasmSource): string {
  // Entries sort by their `name,digest` string form, and a valid name carries
  // no comma, so this orders by name — without indexing back into the record.
  const files = Object.fromEntries(Object.entries(source.files).sort());
  return `${JSON.stringify({ version: source.version, files }, null, 2)}\n`;
}

/**
 * The versions `CHANGELOG.md` states as RELEASED — its `## [x.y.z]` headings.
 * `## [Unreleased]` never matches, which is what stops the site's engine from
 * being pinned to a version that has not shipped.
 */
export function releasedVersions(changelog: string): string[] {
  const versions: string[] = [];
  for (const line of changelog.split("\n")) {
    const m = /^## \[(\d+\.\d+\.\d+)\]/.exec(line);
    if (m?.[1] !== undefined) versions.push(m[1]);
  }
  return versions;
}

/**
 * Every way the committed engine can disagree with its record, as messages.
 * Empty means the site is serving exactly the release it claims to.
 */
export function checkWasmSource(
  source: WasmSource,
  committed: Record<string, string>,
  released: readonly string[],
): string[] {
  const drift: string[] = [];
  if (!released.includes(source.version)) {
    drift.push(`${WASM_SOURCE_PATH}: version ${source.version} is not a released version in CHANGELOG.md`);
  }
  for (const [name, digest] of Object.entries(source.files)) {
    const got = committed[name];
    if (got === undefined) drift.push(`missing: site/.data/wasm/${name} (recorded, not committed)`);
    else if (got !== digest) drift.push(`stale: site/.data/wasm/${name} (sha256 ${got}, recorded ${digest})`);
  }
  for (const name of Object.keys(committed)) {
    if (source.files[name] === undefined) {
      drift.push(`unrecorded: site/.data/wasm/${name} (committed, absent from the record)`);
    }
  }
  return drift;
}

function samePins(a: Record<string, string>, b: Record<string, string>): boolean {
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((n) => a[n] === b[n]);
}

/**
 * Why a re-pin must NOT happen, or undefined to proceed. `make
 * site:wasm-release` is release-time only, and the two ways to run it at the
 * wrong moment are both mechanical:
 *
 * - the version being pinned to is not released yet — the refresh would put
 *   the homepage ahead of the product, which is the whole failure this pin
 *   exists to stop;
 * - the version has NOT moved but the bytes have — same version, different
 *   build is by definition a build that was never released.
 *
 * The second is the one a mid-cycle `make site:wasm-release` would hit, and
 * no hash or version check downstream can see it, because the recorded
 * version stays legitimately released.
 */
export function repinRefusal(
  current: WasmSource | undefined,
  next: WasmSource,
  released: readonly string[],
): string | undefined {
  if (!released.includes(next.version)) {
    return `engine/Cargo.toml declares ${next.version}, which CHANGELOG.md does not list as released — promote the Unreleased section before pointing the site at it`;
  }
  if (current !== undefined && current.version === next.version && !samePins(current.files, next.files)) {
    return `the site is already pinned to ${next.version} and the new bytes differ — same version, different build means an engine that was never released; bump [workspace.package] and promote CHANGELOG.md first`;
  }
  return undefined;
}

/**
 * The workspace version `engine/Cargo.toml` declares — what a release-time
 * refresh stamps into the record, so nobody retypes it.
 */
export function workspacePackageVersion(cargoToml: string): string {
  let inSection = false;
  for (const line of cargoToml.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inSection = trimmed === "[workspace.package]";
      continue;
    }
    if (!inSection) continue;
    const m = /^version\s*=\s*"(\d+\.\d+\.\d+)"/.exec(trimmed);
    if (m?.[1] !== undefined) return m[1];
  }
  throw new Error("engine/Cargo.toml: no [workspace.package] version");
}
