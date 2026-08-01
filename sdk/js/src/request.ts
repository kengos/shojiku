/**
 * The one JSON envelope every document operation crosses with.
 *
 * Both entrances build it: sources resolved from a template NAME and sources
 * the application handed over as BYTES produce the same request, because the
 * engine has one request schema — and that schema rejects unknown keys, so a
 * key the engine may legitimately not receive is dropped rather than sent as
 * null.
 */

import { UsageError } from './errors.js';
import type { Sources } from './sources.js';

/** What one request is built from. */
export interface RequestInit {
  sources: Sources;
  params: unknown;
  lang?: string | null;
  fontDirs?: string[];
  localeDirs?: string[];
}

/** One render's envelope, ready for the addon. */
export class Request {
  private readonly init: RequestInit;

  constructor(init: RequestInit) {
    this.init = init;
  }

  /**
   * The serialized envelope as UTF-8 bytes.
   *
   * Params that cannot be serialized are programmer misuse — the engine's
   * surface is UTF-8 JSON by contract, so there is nothing to render — but a
   * bare `TypeError` from a circular structure escaping `generate` would make
   * callers catch a foreign class they never invited into their code.
   */
  encoded(): Buffer {
    try {
      return Buffer.from(JSON.stringify(this.envelope()), 'utf8');
    } catch (error) {
      throw new UsageError(`params could not be serialized as UTF-8 JSON: ${error}`);
    }
  }

  private envelope(): Record<string, unknown> {
    const candidates: Record<string, unknown> = {
      template: this.init.sources.template,
      definitions: this.init.sources.definitions,
      params: this.paramsSource(),
      lang: this.init.lang,
      fontDirs: this.init.fontDirs ?? [],
      localeDirs: this.init.localeDirs ?? [],
      assetsDir: this.init.sources.assetsDir,
    };
    return Object.fromEntries(
      Object.entries(candidates).filter(([, value]) => value !== null && value !== undefined),
    );
  }

  /**
   * A string params is the caller's own source text, passed through VERBATIM.
   *
   * The engine parses JSON or YAML (YAML is a superset), so re-encoding it here
   * would only be a chance to change it. Anything else is serialized as JSON.
   *
   * There is deliberately no per-format method family — format dispatch is the
   * engine's, and an SDK that offered `generateYaml` would be claiming a
   * distinction the engine does not make.
   */
  private paramsSource(): string {
    const { params } = this.init;
    if (typeof params === 'string') {
      return params;
    }
    return JSON.stringify(params);
  }
}
