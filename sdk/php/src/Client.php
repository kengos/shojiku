<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * The entry point: a configured engine, and the sources to render with it.
 *
 * ```php
 * $client = new Shojiku\Client(templates: 'app/templates');
 * $result = $client->generate('receipt_ja', ['customer' => ['name' => '…']]);
 * if ($result->success()) {
 *     $result->artifact()->write('receipt.pdf');
 * }
 * ```
 *
 * **Two entrances, deliberately.** {@see self::generate()} takes a template
 * NAME and resolves it against the configured root, which is where the
 * containment rules live. {@see self::generateSource()} takes the sources as
 * BYTES the application already has — fetched from object storage, read out
 * of a database, written inline — because fetching is the application's act
 * and this package downloads nothing. Root containment does not apply to
 * bytes a caller supplied: there is no root to be contained by, which is
 * exactly why a strict client refuses that entrance (see {@see Lockdown}).
 *
 * **Precedence, and its one deliberate asymmetry.** An explicit `templates:`
 * beats {@see Configuration::configure()}, which beats
 * `SHOJIKU_TEMPLATE_ROOT`; the pack directories resolve the same way. What an
 * application renders is the application's own decision. An explicit
 * `binary:` is the other way round — `SHOJIKU_BIN` beats it — because where
 * the ENGINE lives is an operator's decision that has to be able to win over
 * application code. Passing `env: false` disables every one of those lookups
 * at once, in this process AND in the engine child. `strict:` is the one
 * setting configuration wins outright, for the reason in {@see Lockdown}.
 */
final class Client
{
    private const ANCHOR_FORMS = '`anchors:` (paths) or `anchorsPem:` (bytes)';

    /** The variable the passphrase crosses in, never `argv`. */
    private const PASSPHRASE_VARIABLE = 'SHOJIKU_PASSPHRASE';

    private readonly Settings $settings;

    /**
     * @param list<string>|null $fontDirs
     * @param list<string>|null $localeDirs
     * @param array<string, LocalPem>|null $providers
     */
    public function __construct(
        ?string $templates = null,
        ?array $fontDirs = null,
        ?array $localeDirs = null,
        ?string $lang = null,
        ?string $binary = null,
        ?object $logger = null,
        ?bool $strict = null,
        ?array $providers = null,
        ?bool $env = null,
    ) {
        $this->settings = new Settings([
            'templates' => $templates,
            'fontDirs' => $fontDirs,
            'localeDirs' => $localeDirs,
            'lang' => $lang,
            'binary' => $binary,
            'logger' => $logger,
            'strict' => $strict,
            'providers' => $providers,
            'env' => $env,
        ]);
    }

    public function templateRoot(): ?TemplateRoot
    {
        return $this->settings->templateRoot();
    }

    /**
     * What this build of the engine can do — its version, capability keys and
     * builtin locales. Gate a feature on this rather than on a package
     * version.
     *
     * A plain array, deliberately. The payload is an append-only wire this
     * SDK does not model, exactly as a diagnostic's typed `args` pass through
     * untranslated: a typed value object would have to grow a field in seven
     * languages every time the engine adds one, and an application reading a
     * key its engine is too old to send already has to handle null.
     *
     * @return array<string, mixed>
     */
    public function engineInfo(): array
    {
        return $this->settings->engine()->engineInfo();
    }

    /**
     * Renders `$name` with `$params`, returning a {@see Result}.
     *
     * `$params` may be an array (serialized here) or a string you already
     * have — JSON or YAML, since the engine parses either and a string is
     * passed through verbatim. `$lang` overrides this client's locale for
     * this call.
     *
     * A rejected template name is a FAILED RESULT, not an exception: a
     * hostile name is a fact about the request, not a bug in the program. A
     * name that is not a string at all IS a bug in the program, and throws.
     */
    public function generate(mixed $name, mixed $params = [], ?string $lang = null): Result
    {
        try {
            $sources = $this->root()->resolve($name);
        } catch (TemplateRejected $rejected) {
            return Result::fromFailure(self::rejection($rejected));
        }

        return $this->settings->log()->timed(
            Step::Generate,
            fn () => $this->render(static fn () => $sources, $params, $lang, Origin::Rendered),
            ['template' => Text::bounded(is_string($name) ? $name : '')],
        );
    }

    /**
     * Renders sources the APPLICATION supplies, returning a {@see Result}.
     *
     * For templates that do not live in a directory this package can see:
     * fetched from object storage, stored in a database, or written inline.
     * Fetching them stays the application's act — nothing here opens a
     * socket.
     *
     * `$template` is source TEXT. A path-shaped value is a template that
     * fails to parse, never a file that gets opened: an SDK that "helpfully"
     * read it would make every containment rule bypassable by spelling the
     * same thing differently.
     *
     * `$assetsDir` is per call rather than per client, because bundled assets
     * belong to a template rather than to a deployment. Without it, bundled
     * image sources are disabled: inline sources have no directory of their
     * own.
     */
    public function generateSource(
        string $template,
        ?string $definitions = null,
        ?string $assetsDir = null,
        mixed $params = [],
        ?string $lang = null,
    ): Result {
        $this->settings->lockdown()->sourceEntrance();

        return $this->settings->log()->timed(
            Step::Generate,
            fn () => $this->render(
                static fn (Workspace $workspace) => Sources::fromBytes(
                    $workspace,
                    $template,
                    $definitions,
                    $assetsDir,
                ),
                $params,
                $lang,
                Origin::Source,
            ),
        );
    }

    /**
     * Re-enters an archived document, so bytes signed some time ago can be
     * verified — or re-signed — without hand-building an artifact.
     *
     * The result is marked as LOADED: its bytes are the caller's rather than
     * this client's own render, which is a distinction a strict client acts
     * on. `pageCount` is null, honestly: nothing here laid anything out.
     */
    public function artifact(string $bytes): DocumentArtifact
    {
        return new DocumentArtifact(
            bytes: $bytes,
            diagnostics: [],
            client: $this,
            origin: Origin::Loaded,
        );
    }

    /**
     * Signs an artifact with `$provider`, returning a {@see Result}. The
     * signed bytes begin with the input byte for byte — signing appends a
     * revision.
     *
     * `$provider` is a {@see LocalPem} (or the NAME of one registered in
     * configuration). A strict client takes the name only.
     */
    public function sign(DocumentArtifact $artifact, LocalPem|string $provider): Result
    {
        $signer = $this->settings->lockdown()->provider($provider);
        $this->settings->lockdown()->signable($artifact);

        return $this->settings->log()->timed(
            Step::Sign,
            fn () => $this->signed($artifact, $signer),
        );
    }

    /**
     * Verifies an artifact against trust anchors, returning a {@see Result}
     * whose value is a {@see VerificationReport}.
     *
     * Anchors are required and are given as paths (`$anchors`, one or
     * several) or as PEM bytes (`$anchorsPem`, which may carry several
     * concatenated). Which form you passed is explicit rather than sniffed,
     * and passing both throws rather than silently preferring one. There is
     * no fallback to the machine's trust store, because the engine never
     * consults one — a default would answer a different question than you
     * asked.
     *
     * A signature that does not verify is a FAILED result that still carries
     * the report, so `notChecked` reaches you either way.
     *
     * @param list<string>|string|null $anchors
     */
    public function verify(
        DocumentArtifact $artifact,
        array|string|null $anchors = null,
        ?string $anchorsPem = null,
    ): Result {
        $paths = self::anchorPaths($anchors, $anchorsPem);

        return $this->settings->log()->timed(
            Step::Verify,
            fn () => Workspace::in(function (Workspace $workspace) use ($artifact, $paths, $anchorsPem) {
                $input = $workspace->write('input.pdf', $artifact->bytes());
                $anchorFiles = $anchorsPem === null
                    ? $paths
                    : [$workspace->write('anchors.pem', $anchorsPem)];
                [$report] = $this->settings->engine()->execute(
                    Request::verify($input, $anchorFiles),
                    $workspace,
                );

                return Outcome::verdict($report);
            }),
        );
    }

    /**
     * @param callable(Workspace): Sources $sources what the entrance has, in
     *                                              the one form the CLI takes
     */
    private function render(callable $sources, mixed $params, ?string $lang, Origin $origin): Result
    {
        // Serialized BEFORE the workspace exists: params that cannot be
        // encoded are programmer misuse, and there is no reason to create a
        // directory to find that out.
        $source = Request::params($params);

        return Workspace::in(function (Workspace $workspace) use ($sources, $source, $lang, $origin) {
            $argv = Request::render(
                $sources($workspace),
                $workspace->write('params.json', $source),
                $lang ?? $this->settings->lang(),
                $this->settings->fontDirs(),
                $this->settings->localeDirs(),
            );
            [$report, $bytes] = $this->settings->engine()->execute($argv, $workspace);

            return Outcome::document($report, $bytes, Step::Generate, $this, $origin);
        });
    }

    /**
     * The signed document inherits the origin of what it signed: appending a
     * revision does not launder where the document came from.
     */
    private function signed(DocumentArtifact $artifact, LocalPem $provider): Result
    {
        return Workspace::in(function (Workspace $workspace) use ($artifact, $provider) {
            $passphrase = $provider->passphrase();
            $argv = Request::sign(
                $workspace->write('input.pdf', $artifact->bytes()),
                // A configured PATH goes across as itself; only material the
                // caller handed over as BYTES is written down, and then only
                // 0600 inside a 0700 directory that is removed on every path.
                $provider->keyPath() ?? $workspace->write('key.pem', (string) $provider->keyPem()),
                $provider->certPath() ?? $workspace->write('cert.pem', (string) $provider->certPem()),
                $passphrase === null ? null : self::PASSPHRASE_VARIABLE,
            );
            [$report, $bytes] = $this->settings->engine()->execute(
                $argv,
                $workspace,
                // The passphrase crosses in the CHILD's environment only —
                // never in `argv`, which other processes can read.
                $passphrase === null ? [] : [self::PASSPHRASE_VARIABLE => $passphrase],
            );

            return Outcome::document($report, $bytes, Step::Sign, $this, $artifact->origin());
        });
    }

    private function root(): TemplateRoot
    {
        return $this->settings->templateRoot() ?? throw new UsageException(
            'no template root: pass new Shojiku\\Client(templates: …), set it with '
            .'Shojiku\\Configuration::configure(), or set SHOJIKU_TEMPLATE_ROOT (which '
            .'`env: false` disables). Sources you already hold go to `generateSource`.',
        );
    }

    /**
     * @param list<string>|string|null $anchors
     *
     * @return list<string>
     */
    private static function anchorPaths(array|string|null $anchors, ?string $anchorsPem): array
    {
        if ($anchors !== null && $anchorsPem !== null) {
            throw new UsageException(sprintf('verify takes either %s, not both', self::ANCHOR_FORMS));
        }
        if ($anchorsPem !== null) {
            return [];
        }
        if ($anchors === null) {
            throw new UsageException(sprintf('verify needs %s', self::ANCHOR_FORMS));
        }
        $paths = is_string($anchors) ? [$anchors] : array_values($anchors);
        if ($paths === []) {
            // An EMPTY list is the same statement as none at all, and the
            // engine would refuse the invocation rather than the document —
            // which would reach the caller as a transport failure instead of
            // as the misuse it is.
            throw new UsageException(sprintf('verify needs %s', self::ANCHOR_FORMS));
        }

        return $paths;
    }

    private static function rejection(TemplateRejected $rejected): Failure
    {
        $cause = $rejected->causeMessage();

        return new Failure(
            step: Step::Generate,
            kind: $rejected->kind(),
            message: $rejected->getMessage(),
            cause: $cause === null ? null : new Failure(Step::Generate, 'io', $cause),
        );
    }
}
