<?php

declare(strict_types=1);

/*
 * The formatter's configuration: PSR-12 plus the small set of rules that keep
 * this package's files reading the same way as the other six SDKs'
 * (`declare(strict_types=1)` everywhere, ordered imports, trailing commas).
 * `docs/agents/sdk.md` asks for php-cs-fixer or PSR-12 via phpcs; this is the
 * former.
 */

$finder = PhpCsFixer\Finder::create()
    ->in([__DIR__.'/src', __DIR__.'/tests', __DIR__.'/tools']);

return (new PhpCsFixer\Config())
    ->setRiskyAllowed(true)
    ->setRules([
        '@PSR12' => true,
        '@PHP83Migration' => true,
        'declare_strict_types' => true,
        'ordered_imports' => ['sort_algorithm' => 'alpha'],
        'no_unused_imports' => true,
        'trailing_comma_in_multiline' => ['elements' => ['arrays', 'arguments', 'parameters']],
        'single_quote' => true,
        'array_syntax' => ['syntax' => 'short'],
        'concat_space' => ['spacing' => 'none'],
        'phpdoc_align' => ['align' => 'left'],
        'no_superfluous_phpdoc_tags' => ['allow_mixed' => true],
    ])
    ->setFinder($finder);
