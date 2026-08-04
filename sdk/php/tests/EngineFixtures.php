<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use Shojiku\Client;
use Shojiku\Configuration;
use Shojiku\DocumentArtifact;
use Shojiku\LocalPem;
use Shojiku\SigningProvider;

/**
 * Fixtures shared by every test: the real engine binary, the repository's own
 * font and locale packs, and generated key material.
 *
 * Nothing here is a stub. This SDK's whole job is to be a faithful transport,
 * so a suite that mocked the subprocess would test the mock. What it does
 * avoid is repeating the setup: one client, one rendered document, one signed
 * document, each built once per process.
 */
trait EngineFixtures
{
    private const REPO_ROOT = __DIR__.'/../../..';

    /** @var array<string, string> */
    private static array $memo = [];

    /** @var array<string, DocumentArtifact> */
    private static array $documents = [];

    protected function tearDown(): void
    {
        // Process-wide state, and the suite runs in one process.
        Configuration::reset();
        parent::tearDown();
    }

    /**
     * Generated, never committed: a repository checkout holds no private key,
     * and a leaked test key is worth nothing. The same generator the Rust
     * suites use, so both sides sign with the same shapes.
     *
     * Memoized so the generator runs ONCE — it writes its completion sentinel
     * last, so a second run racing a test that is reading the files is a real
     * failure mode rather than a theoretical one.
     */
    protected function keysDir(): string
    {
        if (isset(self::$memo['keys'])) {
            return self::$memo['keys'];
        }
        $dir = sys_get_temp_dir().'/shojiku-php-keys-'.getmypid();
        $script = realpath(self::REPO_ROOT.'/scripts/gen-test-keys.sh');
        self::assertNotFalse($script, 'the shared test-key generator is missing');
        exec(sprintf('sh %s %s 2>/dev/null', escapeshellarg($script), escapeshellarg($dir)), $out, $status);
        self::assertSame(0, $status, 'the test-key generator failed');

        return self::$memo['keys'] = $dir;
    }

    protected function keyPath(string $name): string
    {
        return $this->keysDir().'/'.$name;
    }

    protected function passphrase(): string
    {
        return trim((string) file_get_contents($this->keyPath('passphrase.txt')));
    }

    protected function fixtureTemplates(): string
    {
        return __DIR__.'/fixtures/templates';
    }

    /**
     * Where the bytes-first entrance's bundled assets live. A directory
     * rather than a template root: `generateSource` resolves `assets/logo.svg`
     * against it and resolves NOTHING else, since there is no name to look up.
     */
    protected function sourceAssets(): string
    {
        return __DIR__.'/fixtures/sources';
    }

    /**
     * @return list<string>
     */
    protected function fontDirs(): array
    {
        return [self::REPO_ROOT.'/packs/fonts'];
    }

    /**
     * @return list<string>
     */
    protected function localeDirs(): array
    {
        return [self::REPO_ROOT.'/packs/locale'];
    }

    /**
     * The binary path, read once from the environment the image sets. Passed
     * explicitly because the clients below run with `env: false`.
     */
    protected function engineBinary(): string
    {
        $binary = getenv('SHOJIKU_BIN');
        self::assertNotFalse($binary, 'SHOJIKU_BIN is unset; the gate image sets it');

        return $binary;
    }

    /**
     * A client over the fixture template root, with the packs wired up and the
     * environment deliberately OFF — a test that accidentally inherited a
     * `SHOJIKU_*` variable from the runner would be testing the runner.
     *
     * @param array<string, mixed> $overrides
     */
    protected function client(array $overrides = []): Client
    {
        $settings = [
            'templates' => $this->fixtureTemplates(),
            'fontDirs' => $this->fontDirs(),
            'localeDirs' => $this->localeDirs(),
            'binary' => $this->engineBinary(),
            'env' => false,
        ];
        $settings = [...$settings, ...$overrides];

        return new Client(
            templates: self::setting($settings, 'templates'),
            fontDirs: self::dirs($settings, 'fontDirs'),
            localeDirs: self::dirs($settings, 'localeDirs'),
            lang: self::setting($settings, 'lang'),
            binary: self::setting($settings, 'binary'),
            logger: is_object($settings['logger'] ?? null) ? $settings['logger'] : null,
            strict: is_bool($settings['strict'] ?? null) ? $settings['strict'] : null,
            providers: self::providers($settings),
            env: is_bool($settings['env'] ?? null) ? $settings['env'] : null,
        );
    }

    /**
     * One rendered document, built once per process.
     */
    protected function rendered(): DocumentArtifact
    {
        if (isset(self::$documents['rendered'])) {
            return self::$documents['rendered'];
        }
        $result = $this->client()->generate('receipt', ['customer' => ['name' => 'Yamada Shoji K.K.']]);
        self::assertTrue($result->success(), 'the fixture template did not render: '.$result->failure());
        $artifact = $result->artifact();
        self::assertNotNull($artifact);

        return self::$documents['rendered'] = $artifact;
    }

    protected function signer(
        string $key = 'rsa2048.key.pem',
        string $cert = 'rsa2048.cert.pem',
        ?string $passphrase = null,
    ): LocalPem {
        return new LocalPem(
            key: $this->keyPath($key),
            cert: $this->keyPath($cert),
            passphrase: $passphrase,
        );
    }

    /**
     * One signed document, built once per process.
     */
    protected function signed(): DocumentArtifact
    {
        if (isset(self::$documents['signed'])) {
            return self::$documents['signed'];
        }
        $result = $this->rendered()->sign($this->signer());
        self::assertTrue($result->success(), 'the fixture document did not sign: '.$result->failure());
        $artifact = $result->artifact();
        self::assertNotNull($artifact);

        return self::$documents['signed'] = $artifact;
    }

    /**
     * A throwaway directory for one test, removed when the callable returns.
     *
     * @template T
     *
     * @param callable(string): T $body
     *
     * @return T
     */
    protected function inTempDir(callable $body)
    {
        $dir = sys_get_temp_dir().'/shojiku-php-test-'.bin2hex(random_bytes(8));
        mkdir($dir, 0o700);

        try {
            return $body($dir);
        } finally {
            self::removeTree($dir);
        }
    }

    /**
     * `is_link` FIRST: `is_dir` follows a symlink, so a link to a directory
     * would be handed to `rmdir` and the whole cleanup would stop there.
     */
    private static function removeTree(string $dir): void
    {
        foreach (glob($dir.'/*') ?: [] as $path) {
            if (is_link($path) || !is_dir($path)) {
                unlink($path);

                continue;
            }
            self::removeTree($path);
        }
        rmdir($dir);
    }

    /**
     * A template as SOURCE TEXT, for the entrance that never reads a file.
     * `$items` is spliced in already indented to the flow's item list.
     */
    protected function sourceTemplate(string $items): string
    {
        $indented = implode("\n", array_map(
            static fn (string $line) => $line === '' ? $line : '      '.$line,
            explode("\n", rtrim($items, "\n")),
        ));

        return <<<YAML
            version: 0.1.0
            name: inline
            page: { size: A4, margin: 25 }
            defaults:
              locale: en-US
              style: { fontFamily: noto-sans, fontSize: 10.5 }
            sections:
              body:
                type: flow
                items:
            {$indented}
            YAML;
    }

    /**
     * One text item binding `$key`, sized from the fixture templates that
     * render warning-free at this font size.
     */
    protected function textItem(string $key): string
    {
        return <<<YAML
            - id: line
              type: text
              box: { x: 0, y: 0, w: 400, h: 16 }
              text: "Billed to {{$key}}"
            YAML;
    }

    /**
     * @param array<string, mixed> $settings
     */
    private static function setting(array $settings, string $key): ?string
    {
        $value = $settings[$key] ?? null;

        return is_string($value) ? $value : null;
    }

    /**
     * @param array<string, mixed> $settings
     *
     * @return list<string>|null
     */
    private static function dirs(array $settings, string $key): ?array
    {
        $value = $settings[$key] ?? null;
        if (!is_array($value)) {
            return null;
        }

        return array_values(array_filter($value, static fn (mixed $dir) => is_string($dir)));
    }

    /**
     * @param array<string, mixed> $settings
     *
     * @return array<string, SigningProvider>|null
     */
    private static function providers(array $settings): ?array
    {
        $value = $settings['providers'] ?? null;
        if (!is_array($value)) {
            return null;
        }
        $providers = [];
        foreach ($value as $name => $provider) {
            if ($provider instanceof SigningProvider) {
                $providers[(string) $name] = $provider;
            }
        }

        return $providers;
    }
}
