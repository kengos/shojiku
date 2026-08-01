<?php

declare(strict_types=1);

/*
 * The 100%-line-coverage gate.
 *
 * PHPUnit has no fail-under flag, so the bar every other package in this
 * repository gets from its own tooling (SimpleCov's `minimum_coverage`,
 * pytest's `--cov-fail-under`, coverlet's threshold, jacoco's COVEREDRATIO)
 * is asserted here from the clover report instead. `docs/agents/sdk.md` names
 * exactly this arrangement for PHP.
 *
 * It lives in tools/ rather than tests/ so it is not itself part of the
 * measured surface — it is gate plumbing, like a make recipe, and it is
 * linted and analysed with everything else.
 */

$report = __DIR__.'/../build/clover.xml';
if (!is_file($report)) {
    fwrite(STDERR, "coverage: no clover report at {$report}; run phpunit first\n");
    exit(1);
}

$xml = simplexml_load_file($report);
if ($xml === false) {
    fwrite(STDERR, "coverage: {$report} is not readable XML\n");
    exit(1);
}

$metrics = $xml->xpath('/coverage/project/metrics');
if ($metrics === null || $metrics === []) {
    fwrite(STDERR, "coverage: {$report} carries no project metrics\n");
    exit(1);
}

$statements = (int) $metrics[0]['statements'];
$covered = (int) $metrics[0]['coveredstatements'];
// A zero-statement report means the run measured nothing at all — a missing
// coverage driver, or a `source` section that matched no files. Reporting
// "100%" for it is how a coverage gate silently stops being one.
if ($statements === 0) {
    fwrite(STDERR, "coverage: the report measured no statements at all\n");
    exit(1);
}

if ($covered === $statements) {
    printf("coverage: %d/%d lines (100%%)\n", $covered, $statements);
    exit(0);
}

printf("coverage: %d/%d lines — %d uncovered\n", $covered, $statements, $statements - $covered);
foreach ($xml->xpath('//file') ?: [] as $file) {
    $uncovered = [];
    foreach ($file->line as $line) {
        if ((int) $line['count'] === 0) {
            $uncovered[] = (string) $line['num'];
        }
    }
    if ($uncovered !== []) {
        printf("  %s: %s\n", (string) $file['name'], implode(', ', $uncovered));
    }
}
exit(1);
