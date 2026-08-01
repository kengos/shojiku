/**
 * Resolving a template NAME to the sources behind it.
 *
 * A name is an identifier, never a path. A bundle format will take this lookup
 * over later, so nothing outside this class may assume a directory is how names
 * resolve — callers ask for `"receipt_ja"` and get sources back.
 *
 * **The rejection rules are the union across platforms, not the host's.**
 * Windows is a first-class target (it is what the .NET SDK's market runs on),
 * so a backslash is a separator, `C:name` is drive-relative, `\\host\share` is
 * a UNC path and `CON`/`NUL` are reserved devices — every one of them refused
 * on EVERY platform. A template name that is valid on one machine is valid on
 * all of them, which is the only way the same application deploys to both.
 */

import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { bounded } from './errors.js';
import type { Sources } from './sources.js';

/**
 * Reserved DOS device names. Windows resolves these no matter what directory
 * you are in and no matter what extension you append.
 */
const DEVICES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

// A name is ONE segment. Refusing both separators outright subsumes traversal,
// absolute paths and nested lookups in a single rule — the simplest thing six
// other SDKs can mirror without drifting.
const SEPARATORS = /[/\\]/;
const DRIVE_RELATIVE = /^[A-Za-z]:/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point, so the class must contain them
const CONTROL = /[\x00-\x1f\x7f]/;
const TRAILING_DOTS_AND_SPACES = /[.\s]+$/;

const TEMPLATE_FILE = 'templates.yml';
const DEFINITIONS_FILE = 'definitions.yml';

/**
 * A refused name or an unreadable template.
 *
 * Rejection is an exception INSIDE this class and a failed result outside it —
 * a hostile template name is a fact about the request, not a bug in the calling
 * program.
 */
export class RejectedError extends Error {
  readonly kind: string;
  readonly causeMessage: string | null;

  constructor(kind: string, message: string, causeMessage: string | null = null) {
    super(message);
    this.name = 'RejectedError';
    this.kind = kind;
    this.causeMessage = causeMessage;
  }
}

/**
 * Trailing dots and spaces are STRIPPED by Windows before it resolves a name,
 * so `CON.` and `"CON "` are the CON device just as `CON` is. Without that
 * strip they slip past this rule and are refused later, by containment — still
 * refused, but with a message about a missing template rather than about a
 * reserved name.
 */
function isDevice(name: string): boolean {
  const stem = name.split('.')[0].replace(TRAILING_DOTS_AND_SPACES, '');
  return DEVICES.has(stem.toUpperCase());
}

/** Each rule, what fires it, and what a caller is told when it does. */
const RULES: ReadonlyArray<readonly [(name: string) => boolean, string]> = [
  [
    (name) => SEPARATORS.test(name),
    'a name is one segment, so `/` and `\\` are never part of it ' +
      '(which is also what makes `..` traversal impossible)',
  ],
  [(name) => CONTROL.test(name), 'it contains a control character'],
  [
    (name) => DRIVE_RELATIVE.test(name),
    'it is drive-relative, which Windows resolves against that drive’s current directory',
  ],
  [isDevice, 'it is a reserved device name on Windows'],
];

/** One configured root, and the only thing that turns names into sources. */
export class TemplateRoot {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Resolve `name`, or throw `RejectedError` naming why it will not. */
  async resolve(name: string): Promise<Sources> {
    reject(name);
    const real = await this.contained(join(this.path, name));
    return {
      template: await read(join(real, TEMPLATE_FILE)),
      definitions: await optional(join(real, DEFINITIONS_FILE)),
      assetsDir: real,
    };
  }

  /**
   * The check a name-shape rule cannot make.
   *
   * After following whatever the filesystem has there, is the answer still
   * inside the root? A symlink is what this exists for — it passes every rule
   * above and still points out.
   *
   * `realpath` rejects for a path that is not there, which is what makes a
   * missing template a named refusal rather than a confusing read error later.
   */
  private async contained(directory: string): Promise<string> {
    let root: string;
    let real: string;
    try {
      root = await realpath(this.path);
      real = await realpath(directory);
    } catch (error) {
      throw new RejectedError('template_not_found', 'no template by that name', String(error));
    }

    // Structural, not a prefix compare: a sibling `root-evil` beats the latter.
    const inside = relative(root, real);
    if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
      return real;
    }

    throw new RejectedError(
      'template_escapes_root',
      'the template resolves outside the template root',
    );
  }
}

/**
 * A BLANK name stays a refused request: it can arrive straight from a form
 * field. A name that is not a string at all is programmer misuse and is caught
 * one layer up, before this ever runs.
 */
function reject(name: string): void {
  if (name.trim() === '') {
    throw new RejectedError('template_name', 'a template name must not be empty');
  }

  for (const [fires, explanation] of RULES) {
    if (fires(name)) {
      throw new RejectedError(
        'template_name',
        `\`${bounded(name)}\` is not a template name: ${explanation}`,
      );
    }
  }
}

async function read(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new RejectedError('template_unreadable', 'the template could not be read', String(error));
  }
}

/**
 * The definitions file, which a template need not have.
 *
 * ABSENCE is what makes it optional — not unreadability. Only "no such file"
 * means there are none; anything else is a deployment problem, and swallowing
 * it would render the document as though it declared no schema at all.
 *
 * Testing the two apart is why this branches on the ERRNO rather than on an
 * `isFile()` probe: a probe reports a directory-where-a-file-belongs as
 * absent, which is the very case a gate container running as root can produce
 * and a `chmod` cannot.
 */
async function optional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new RejectedError(
      'template_unreadable',
      'the definitions file could not be read',
      String(error),
    );
  }
}
