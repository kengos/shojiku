/**
 * Process-wide configuration, and the entry points that reach it.
 *
 * The ecosystem idiom (a `configure` call in application start-up) OVER the
 * constructor, never a third precedence layer: what `configure` sets stands
 * exactly where an explicit constructor argument stands against the
 * environment. So the order is
 *
 *     explicit argument > shojiku.configure > SHOJIKU_*
 *
 * for the template root and the pack directories, and the deliberate reverse
 * for the engine addon — `SHOJIKU_LIBRARY` still wins over both, because where
 * the engine lives is a deployment decision.
 *
 * **`strict` is the one exception, and it is the only place `configure` beats a
 * call site.** Strictness is a restriction rather than a default: an operator
 * who declared a lockdown must not have it lifted by application code passing
 * `strict: false`. Every SDK mirrors that asymmetry.
 *
 * The rule the other six mirror: an ecosystem-standard configuration idiom
 * feeds the same constructor and never adds a precedence level of its own.
 */

import { bounded, UsageError } from './errors.js';
import type { Logger } from './log.js';

/** Every setting a client can take. */
export interface ClientOptions {
  templates?: string | null;
  fontDirs?: string[] | null;
  localeDirs?: string[] | null;
  lang?: string | null;
  library?: string | null;
  logger?: Logger | null;
  strict?: boolean | null;
  providers?: Record<string, unknown> | null;
  env?: boolean | null;
}

/**
 * The setting names, as a Set — a misspelled key is a named error rather than
 * a silently ignored one, and the membership test never walks a prototype.
 */
export const ATTRIBUTES: ReadonlySet<string> = new Set([
  'templates',
  'fontDirs',
  'localeDirs',
  'lang',
  'library',
  'logger',
  'strict',
  'providers',
  'env',
]);

/** Process-wide defaults for every client built after it is set. */
export class Config {
  templates: string | null = null;
  fontDirs: string[] | null = null;
  localeDirs: string[] | null = null;
  lang: string | null = null;
  library: string | null = null;
  logger: Logger | null = null;
  strict = false;
  providers: Record<string, unknown> = {};
  env = true;

  /**
   * A copy with `overrides` applied — one client's resolution step.
   *
   * A null or absent override means "not given", so an explicit constructor
   * argument beats a configured default and an absent one inherits it. `strict`
   * is the exception documented above: it is OR-ed rather than overridden.
   *
   * `providers` replaces rather than merges. A client that declares its own
   * registry is stating the whole set it may sign with, and quietly adding
   * globally-registered keys to that set would defeat the point.
   */
  merge(overrides: ClientOptions): Config {
    const merged = Object.assign(new Config(), this);
    for (const [key, value] of Object.entries(overrides)) {
      check(key);
      if (value !== null && value !== undefined) {
        Object.assign(merged, { [key]: value });
      }
    }

    merged.strict = this.strict || merged.strict;
    return merged;
  }
}

let current = new Config();

/** The process-wide defaults, read by every client at construction. */
export function config(): Config {
  return current;
}

/**
 * Set process-wide defaults.
 *
 * ```js
 * configure({ templates: 'app/templates', lang: 'ja-JP' });
 * ```
 */
export function configure(settings: ClientOptions): Config {
  for (const [key, value] of Object.entries(settings)) {
    check(key);
    Object.assign(current, { [key]: value });
  }
  return current;
}

/**
 * Drop every configured default.
 *
 * Public because a global that cannot be reset makes every test suite invent
 * its own teardown — and get it wrong in a randomly-ordered run. Applications
 * call it at most once, if at all.
 */
export function resetConfiguration(): void {
  current = new Config();
}

function check(key: string): void {
  if (!ATTRIBUTES.has(key)) {
    throw new UsageError(`unknown client setting \`${bounded(key)}\``);
  }
}
