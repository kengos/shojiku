/**
 * The one place this package reads the environment.
 *
 * A client is constructed with `env: true` (the default) or `env: false`, and
 * that single flag governs EVERY `SHOJIKU_*` lookup — the template root, the
 * font and locale directories, and the addon path. One flag rather than one per
 * variable is the reference decision the other six SDKs mirror: an application
 * that wants a hermetic configuration wants all of it off, and a per-variable
 * set of knobs is a shape nobody can keep consistent across seven languages.
 *
 * Disabled lookups behave exactly as unset variables do, so calling code has no
 * second branch to get wrong.
 */

import { delimiter } from 'node:path';

/** Reads `SHOJIKU_*` variables, or does not, per one flag. */
export class Env {
  private readonly enabled: boolean;
  private readonly source: Map<string, string>;

  constructor(enabled: boolean, source?: Record<string, string | undefined>) {
    this.enabled = enabled;
    // A Map, not the object itself: every lookup here is by a name this package
    // controls today, and a Map is what keeps that true if one ever is not.
    this.source = new Map(
      Object.entries(source ?? process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
  }

  /** The variable's value, or null when unset, blank, or lookups are off. */
  get(name: string): string | null {
    if (!this.enabled) {
      return null;
    }

    return this.source.get(name) || null;
  }

  /**
   * A `path.delimiter`-separated variable as a list of directories.
   *
   * Which is how every other tool in this family spells "several paths in one
   * variable".
   */
  paths(name: string): string[] {
    const value = this.get(name);
    if (value === null) {
      return [];
    }

    return value.split(delimiter).filter((entry) => entry !== '');
  }
}
