<?php

declare(strict_types=1);

namespace Shojiku\Tests;

/**
 * A stand-in for the engine binary, for the failure modes only a subprocess
 * transport has.
 *
 * The real engine cannot be made to die mid-write, to answer with something
 * that is not its report, or to predate its own `--report` flag — so those
 * paths are driven by a script that does exactly that and nothing else.
 * Everything ELSE in this suite runs against the real binary: this exists for
 * the cases where "what if the thing on the other end is not what we think"
 * is the claim under test.
 */
trait StubBinary
{
    /**
     * The capability payload a current engine answers with.
     */
    private const STUB_CAPABILITIES = '{"version":"9.9.9","capabilities":["cli.report"],"builtinLocales":["en-US"]}';

    /**
     * Writes an executable stub into `$dir` and returns its path.
     *
     * `$body` is shell run for a lifecycle command, with `$report` already
     * holding whatever `--report` pointed at.
     */
    protected function stubBinary(string $dir, string $body, string $capabilities = self::STUB_CAPABILITIES): string
    {
        $path = $dir.'/shojiku-stub';
        $script = <<<SH
            #!/bin/sh
            if [ "\$1" = "capabilities" ]; then
                printf '%s' '{$capabilities}'
                exit 0
            fi
            report=""
            prev=""
            for arg in "\$@"; do
                if [ "\$prev" = "--report" ]; then report="\$arg"; fi
                prev="\$arg"
            done
            {$body}
            SH;
        file_put_contents($path, $script."\n");
        chmod($path, 0o755);

        return $path;
    }
}
