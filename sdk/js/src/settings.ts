/**
 * One client's resolved configuration, plus the collaborators built from it.
 *
 * `config.ts` answers "what was configured"; this answers "what does THIS
 * client use", which is the merge of the process-wide defaults with the options
 * the client was constructed with. Keeping it out of the client keeps the
 * precedence rules in one readable place instead of spread across a
 * constructor.
 *
 * Everything is built lazily and memoized: a bytes-first application never
 * configures a template root, and demanding one at construction would refuse a
 * legitimate client.
 */

import type { ClientOptions, Config } from './config.js';
import { config } from './config.js';
import { Env } from './env.js';
import { Library } from './library.js';
import { Lockdown } from './lockdown.js';
import { Log } from './log.js';
import { TemplateRoot } from './templateRoot.js';

/** The resolved settings of one client, and what they build. */
export class Settings {
  readonly lang: string | null;
  private readonly resolved: Config;
  private cachedEnv: Env | null = null;
  private cachedLog: Log | null = null;
  private cachedLockdown: Lockdown | null = null;
  private cachedLibrary: Library | null = null;
  private cachedRoot: TemplateRoot | null = null;

  constructor(overrides: ClientOptions) {
    this.resolved = config().merge(overrides);
    this.lang = this.resolved.lang;
  }

  get env(): Env {
    this.cachedEnv ??= new Env(this.resolved.env);
    return this.cachedEnv;
  }

  get log(): Log {
    this.cachedLog ??= new Log(this.resolved.logger);
    return this.cachedLog;
  }

  get lockdown(): Lockdown {
    this.cachedLockdown ??= new Lockdown(this.resolved.strict, this.resolved.providers);
    return this.cachedLockdown;
  }

  get library(): Library {
    this.cachedLibrary ??= new Library(this.resolved.library, this.env, this.log);
    return this.cachedLibrary;
  }

  get fontDirs(): string[] {
    return this.resolved.fontDirs ?? this.env.paths('SHOJIKU_FONT_DIR');
  }

  get localeDirs(): string[] {
    return this.resolved.localeDirs ?? this.env.paths('SHOJIKU_LOCALE_DIR');
  }

  /** The template root, or null when nothing configured one. */
  get templateRoot(): TemplateRoot | null {
    if (this.cachedRoot === null) {
      const root = this.resolved.templates || this.env.get('SHOJIKU_TEMPLATE_ROOT');
      this.cachedRoot = root ? new TemplateRoot(root) : null;
    }
    return this.cachedRoot;
  }
}
