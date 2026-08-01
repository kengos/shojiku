<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Exception\EngineFailureException;
use Shojiku\LocalPem;
use Shojiku\Workspace;

/**
 * The private directory one operation borrows.
 *
 * A subprocess SDK has to put the caller's bytes somewhere the engine can
 * read them, which makes this the one place in the package that writes
 * anything — including, when a key was handed over as bytes, a private key.
 * Every claim the class makes is proved here rather than asserted in a
 * comment.
 */
final class WorkspaceTest extends TestCase
{
    use EngineFixtures;

    public function testTheDirectoryIsPrivateAndTheFilesInItArePrivateToo(): void
    {
        Workspace::in(function (Workspace $workspace): void {
            $path = $workspace->write('key.pem', 'secret');

            self::assertSame('0700', substr(sprintf('%o', fileperms($workspace->path())), -4));
            self::assertSame('0600', substr(sprintf('%o', fileperms($path)), -4));
            self::assertSame('secret', file_get_contents($path));
        });
    }

    public function testEachCallGetsItsOwnDirectory(): void
    {
        $first = Workspace::in(static fn (Workspace $w) => $w->path());
        $second = Workspace::in(static fn (Workspace $w) => $w->path());

        self::assertNotSame($first, $second);
    }

    public function testTheDirectoryIsRemovedWhenTheOperationEnds(): void
    {
        $path = Workspace::in(static function (Workspace $workspace): string {
            $workspace->write('params.json', '{}');

            return $workspace->path();
        });

        self::assertDirectoryDoesNotExist($path);
    }

    public function testTheDirectoryIsRemovedWhenTheOperationThrows(): void
    {
        $path = null;

        $propagated = false;

        try {
            Workspace::in(static function (Workspace $workspace) use (&$path): void {
                $path = $workspace->path();
                $workspace->write('input.pdf', 'bytes');
                throw new \RuntimeException('the operation failed');
            });
        } catch (\RuntimeException) {
            $propagated = true;
        }

        self::assertTrue($propagated, 'the exception did not propagate');
        self::assertIsString($path);
        self::assertDirectoryDoesNotExist($path);
    }

    public function testAReservedNameIsRemovedEvenThoughNothingHereWroteIt(): void
    {
        // The report is written by the CHILD, so the workspace never sees its
        // content — it still has to take it away.
        $reserved = Workspace::in(static function (Workspace $workspace): string {
            $path = $workspace->reserve('report.json');
            file_put_contents($path, '{"ok":true}');

            return $path;
        });

        self::assertFileDoesNotExist($reserved);
    }

    public function testAnUncreatableDirectoryIsAHostFailureRatherThanASilentFallback(): void
    {
        $this->expectException(EngineFailureException::class);
        $this->expectExceptionMessageMatches('/could not create the temporary directory/');
        Workspace::in(static fn (Workspace $w) => $w->path(), '/nonexistent-parent');
    }

    public function testAFileThatCannotBeWrittenIsAHostFailure(): void
    {
        $this->expectException(EngineFailureException::class);
        $this->expectExceptionMessageMatches('/could not write into the temporary directory/');
        Workspace::in(static function (Workspace $workspace): void {
            // A name with a separator in it does not resolve inside the
            // workspace, and `fopen` in exclusive mode refuses rather than
            // creating a path outside it.
            $workspace->write('nested/params.json', '{}');
        });
    }

    public function testASignedRenderLeavesNothingBehind(): void
    {
        // End to end: the key bytes, the input PDF and the report all live in
        // a workspace for the length of one call, and no workspace survives
        // it. The glob is the workspace's own shape (24 hex characters), not
        // a bare `shojiku-*` — the suite's key directory is in the same
        // parent and would be counted.
        $pattern = sys_get_temp_dir().'/shojiku-'.str_repeat('[0-9a-f]', 24);
        $key = (string) file_get_contents($this->keyPath('rsa2048.key.pem'));
        $cert = (string) file_get_contents($this->keyPath('rsa2048.cert.pem'));
        $document = $this->rendered();
        self::assertSame([], glob($pattern) ?: []);

        $result = $document->sign(new LocalPem(keyPem: $key, certPem: $cert));

        self::assertTrue($result->success());
        self::assertSame([], glob($pattern) ?: []);
    }
}
