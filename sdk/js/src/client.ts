/**
 * The entry point: a configured engine, and the sources to render with it.
 *
 * ```js
 * const client = new Client({ templates: 'app/templates' });
 * const result = await client.generate('receipt_ja', { customer: { name: '…' } });
 * if (result.success) await result.artifact.write('receipt.pdf');
 * ```
 *
 * **Two entrances, deliberately.** `generate` takes a template NAME and
 * resolves it against the configured root, which is where the containment rules
 * live. `generateSource` takes the sources as BYTES the application already has
 * — fetched from object storage, read out of a database, written inline —
 * because fetching is the application's act and this package downloads nothing.
 * Root containment does not apply to bytes a caller supplied: there is no root
 * to be contained by, which is exactly why a strict client refuses that
 * entrance.
 *
 * **Precedence, and its one deliberate asymmetry.** An explicit `templates`
 * beats `configure`, which beats `SHOJIKU_TEMPLATE_ROOT`; the pack directories
 * resolve the same way. What an application renders is the application's own
 * decision. An explicit `library` is the other way round — `SHOJIKU_LIBRARY`
 * beats it — because where the ENGINE lives is an operator's decision that has
 * to be able to win over application code, the same order the subprocess SDKs
 * give `SHOJIKU_BIN`. Passing `env: false` disables every one of those lookups
 * at once. `strict` is the one setting `configure` wins outright.
 *
 * **Every lifecycle call is async.** Rendering is CPU work, and the addon runs
 * it on the libuv threadpool so node's event loop stays free. That also means
 * programmer misuse REJECTS rather than throwing synchronously — one shape for
 * the whole surface, so `client.sign(…).catch(…)` catches a lockdown refusal
 * exactly as a `try`/`await` does.
 */

import { DocumentArtifact, Origin } from './artifact.js';
import type { ClientOptions } from './config.js';
import { Engine } from './engine.js';
import { bounded, MaterialUnreadableError, readMaterial, UsageError } from './errors.js';
import type { Step } from './failure.js';
import { Failure } from './failure.js';
import type { Snapshot } from './library.js';
import * as outcome from './outcome.js';
import { Request } from './request.js';
import { Result } from './result.js';
import { Settings } from './settings.js';
import type { Sources } from './sources.js';
import { RejectedError, type TemplateRoot } from './templateRoot.js';
import type { VerificationReport } from './verificationReport.js';

const ANCHOR_FORMS = '`anchors` (paths) or `anchorsPem` (bytes)';

/** What one verification's trust anchors were given as. */
export interface Anchors {
  anchors?: string | string[];
  anchorsPem?: Buffer;
}

/** A signing provider: whatever `LocalPem` is, plus the material it loads. */
interface Provider {
  key(): Promise<Buffer>;
  certificate(): Promise<Buffer>;
  passphrase: Buffer | string | null;
}

/** A configured engine and the sources to render with it. */
export class Client {
  private readonly settings: Settings;
  private readonly engine: Engine;

  constructor(options: ClientOptions = {}) {
    this.settings = new Settings(options);
    this.engine = new Engine(this.settings.library);
  }

  get templateRoot(): TemplateRoot | null {
    return this.settings.templateRoot;
  }

  /**
   * What this build of the engine can do — its version, capability keys and
   * builtin locales. Gate a feature on this rather than on a package version.
   *
   * A plain object, deliberately. The payload is an append-only wire this SDK
   * does not model, exactly as a diagnostic's typed `args` pass through
   * untranslated: a typed value object would have to grow a field in seven
   * languages every time the engine adds one.
   */
  async engineInfo(): Promise<Record<string, unknown>> {
    const snapshot = await this.engine.engineInfo();
    outcome.guard(snapshot);
    return JSON.parse(snapshot.json);
  }

  /**
   * Render `name` with `params`.
   *
   * `params` may be an object (serialized here) or a string you already have —
   * JSON or YAML, since the engine parses either and a string is passed through
   * verbatim.
   *
   * `lang` overrides this client's locale for this call alone, which is how a
   * multi-locale application renders one template per buyer's locale without
   * building a second client. (The ruby reference spells the same override as a
   * derived client, because a keyword beside its trailing-hash params would
   * break the ordinary call form; what every SDK mirrors is that a per-call
   * locale beats the client-wide one, not the spelling.)
   *
   * A rejected template name is a FAILED RESULT, not an exception: a hostile
   * name is a fact about the request, not a bug in the program. A name that is
   * not a string at all IS a bug in the program, and throws.
   */
  async generate(
    name: string,
    params: unknown = null,
    options: { lang?: string } = {},
  ): Promise<Result<DocumentArtifact>> {
    identifier(name);
    let sources: Sources;
    try {
      sources = await this.root().resolve(name);
    } catch (error) {
      if (!(error instanceof RejectedError)) {
        throw error;
      }
      return Result.fromFailure(rejection(error, 'generate'));
    }

    return this.render(sources, params, Origin.RENDERED, options.lang, {
      template: bounded(name),
    });
  }

  /**
   * Render sources the APPLICATION supplies.
   *
   * For templates that do not live in a directory this package can see: fetched
   * from object storage, stored in a database, or written inline. Fetching them
   * stays the application's act — nothing here opens a socket.
   *
   * `template` is source TEXT, never a path: a path-shaped value is a template
   * that fails to parse. An SDK that helpfully opened it would make every
   * containment rule bypassable by spelling the same thing differently.
   *
   * `assetsDir` is per call rather than per client, because bundled assets
   * belong to a template rather than to a deployment. Without it, bundled image
   * sources are disabled: inline sources have no directory of their own.
   */
  async generateSource(
    sources: Sources & { params?: unknown; lang?: string },
  ): Promise<Result<DocumentArtifact>> {
    this.settings.lockdown.sourceEntrance();
    const { params, lang, ...rest } = sources;
    return this.render(rest, params, Origin.SOURCE, lang);
  }

  /**
   * Re-enter an archived document, so bytes signed some time ago can be
   * verified — or re-signed — without hand-building an artifact.
   *
   * The result is marked as LOADED: its bytes are the caller's rather than this
   * client's own render, which is a distinction a strict client acts on.
   * `pageCount` is null, honestly: nothing here laid anything out.
   */
  artifact(data: Buffer): DocumentArtifact {
    return new DocumentArtifact({
      bytes: data,
      diagnostics: [],
      client: this,
      origin: Origin.LOADED,
    });
  }

  /**
   * Sign an artifact with `provider`.
   *
   * The signed bytes begin with the input byte for byte — signing appends a
   * revision.
   *
   * `provider` is a `LocalPem` (or another provider object), or the NAME of one
   * registered in configuration. A strict client takes the name only.
   */
  async sign(artifact: DocumentArtifact, provider: unknown): Promise<Result<DocumentArtifact>> {
    const signer = this.settings.lockdown.provider(provider) as Provider;
    this.settings.lockdown.signable(artifact);
    return this.settings.log.timed('sign', () => this.signed(artifact, signer));
  }

  /**
   * Verify an artifact against trust anchors.
   *
   * Anchors are required and are given as paths (`anchors`, one or several) or
   * as PEM bytes (`anchorsPem`, which may carry several concatenated). Which
   * form you passed is explicit rather than sniffed, and passing both throws
   * rather than silently preferring one. There is no fallback to the machine's
   * trust store, because the engine never consults one — a default would answer
   * a different question than you asked.
   *
   * A signature that does not verify is a FAILED result that still carries the
   * report, so `notChecked` reaches you either way.
   */
  async verify(artifact: DocumentArtifact, anchors: Anchors): Promise<Result<VerificationReport>> {
    let pem: Buffer;
    try {
      pem = await anchorMaterial(anchors);
    } catch (error) {
      if (!(error instanceof MaterialUnreadableError)) {
        throw error;
      }
      return Result.fromFailure(
        new Failure({ step: 'verify', kind: error.kind, message: String(error.message) }),
      );
    }

    return this.settings.log.timed('verify', async () =>
      outcome.verdict(await this.engine.verify(artifact.bytes, pem)),
    );
  }

  private render(
    sources: Sources,
    params: unknown,
    origin: Origin,
    lang: string | undefined,
    fields: Record<string, string> = {},
  ): Promise<Result<DocumentArtifact>> {
    const request = new Request({
      sources,
      params: params ?? {},
      lang: lang ?? this.settings.lang,
      fontDirs: this.settings.fontDirs,
      localeDirs: this.settings.localeDirs,
    });
    const encoded = request.encoded();
    return this.settings.log.timed(
      'generate',
      async () => outcome.document(await this.engine.render(encoded), 'generate', this, origin),
      fields,
    );
  }

  /**
   * The signed document inherits the origin of what it signed. Appending a
   * revision does not launder where the document came from.
   */
  private async signed(
    artifact: DocumentArtifact,
    provider: Provider,
  ): Promise<Result<DocumentArtifact>> {
    let snapshot: Snapshot;
    try {
      snapshot = await this.engine.sign(
        artifact.bytes,
        await provider.key(),
        await provider.certificate(),
        passphraseBytes(provider.passphrase),
      );
    } catch (error) {
      if (!(error instanceof MaterialUnreadableError)) {
        throw error;
      }
      return Result.fromFailure(
        new Failure({ step: 'sign', kind: error.kind, message: String(error.message) }),
      );
    }

    return outcome.document(snapshot, 'sign', this, artifact.origin);
  }

  private root(): TemplateRoot {
    const root = this.templateRoot;
    if (root !== null) {
      return root;
    }

    throw new UsageError(
      'no template root: pass new Client({ templates: … }), set it with ' +
        'configure(), or set SHOJIKU_TEMPLATE_ROOT (which `env: false` disables). ' +
        'Sources you already hold go to `generateSource`.',
    );
  }
}

/**
 * A name is an IDENTIFIER, so anything that is not a string is a bug in the
 * calling program. A BLANK string is the other case and stays a refused
 * request: it can arrive straight from a form field.
 */
function identifier(name: unknown): void {
  if (typeof name === 'string') {
    return;
  }

  throw new UsageError(
    `a template name must be a string; got ${typeof name}. ` +
      'Sources you already hold go to `generateSource`.',
  );
}

function passphraseBytes(passphrase: Buffer | string | null): Buffer | null {
  if (typeof passphrase === 'string') {
    return Buffer.from(passphrase, 'utf8');
  }
  return passphrase;
}

async function anchorMaterial({ anchors, anchorsPem }: Anchors): Promise<Buffer> {
  if (anchors !== undefined && anchorsPem !== undefined) {
    throw new UsageError(`verify takes either ${ANCHOR_FORMS}, not both`);
  }
  if (anchorsPem !== undefined) {
    return anchorsPem;
  }
  if (anchors === undefined) {
    throw new UsageError(`verify needs ${ANCHOR_FORMS}`);
  }

  const listed = typeof anchors === 'string' ? [anchors] : anchors;
  const read = await Promise.all(listed.map((path) => readMaterial(path, 'anchor_unreadable')));
  return Buffer.concat(read.flatMap((bytes, index) => (index === 0 ? [bytes] : [NEWLINE, bytes])));
}

const NEWLINE = Buffer.from('\n');

function rejection(error: RejectedError, step: Step): Failure {
  const cause = error.causeMessage
    ? new Failure({ step, kind: 'io', message: error.causeMessage })
    : null;
  return new Failure({ step, kind: error.kind, message: error.message, cause });
}
