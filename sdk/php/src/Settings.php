<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * One client's resolved configuration, plus the collaborators built from it.
 *
 * {@see Configuration} answers "what was configured"; this answers "what does
 * THIS client use", which is the merge of the process-wide defaults with the
 * arguments the client was constructed with. Keeping it out of {@see Client}
 * keeps the precedence rules in one readable place instead of spread across a
 * constructor.
 *
 * Everything is built lazily and memoized: a bytes-first application never
 * configures a template root, and demanding one at construction would refuse
 * a legitimate client.
 */
final class Settings
{
    private readonly Configuration $config;
    private readonly Engine $engine;
    private ?string $lang;
    private ?Env $env = null;
    private ?Log $log = null;
    private ?Lockdown $lockdown = null;
    private bool $rootResolved = false;
    private ?TemplateRoot $templateRoot = null;

    /**
     * @param array<string, mixed> $overrides
     */
    public function __construct(array $overrides)
    {
        $this->config = Configuration::global()->merge($overrides);
        $this->lang = $this->config->lang;
        $this->engine = new Engine(
            new Binary($this->config->binary, $this->env()),
            $this->env(),
            $this->log(),
        );
    }

    /**
     * The client-wide locale. A per-call `lang` beats it; what the six mirror
     * is that precedence, not the spelling.
     */
    public function lang(): ?string
    {
        return $this->lang;
    }

    public function env(): Env
    {
        return $this->env ??= new Env(enabled: $this->config->env);
    }

    public function log(): Log
    {
        return $this->log ??= new Log($this->config->logger);
    }

    public function lockdown(): Lockdown
    {
        return $this->lockdown ??= new Lockdown(
            strict: $this->config->strict,
            providers: $this->config->providers ?? [],
        );
    }

    /**
     * The engine, found once.
     *
     * NOT lazy, unlike everything else here: the reference builds its engine
     * in the client's constructor, so a client cannot exist over an engine
     * that is not installed, and a container that builds one at boot learns
     * that at boot rather than at the first request. What IS lazy is the
     * capability probe (see {@see Engine::requireReport()}) — locating a
     * binary is a stat, asking it what it can do is a whole process.
     */
    public function engine(): Engine
    {
        return $this->engine;
    }

    /**
     * @return list<string>
     */
    public function fontDirs(): array
    {
        return $this->config->fontDirs ?? $this->env()->paths('SHOJIKU_FONT_DIR');
    }

    /**
     * @return list<string>
     */
    public function localeDirs(): array
    {
        return $this->config->localeDirs ?? $this->env()->paths('SHOJIKU_LOCALE_DIR');
    }

    /**
     * The template root, or null when nothing configured one.
     *
     * A separate `rootResolved` flag rather than a null check, because null is
     * a legitimate answer here and would otherwise be re-resolved on every
     * call.
     */
    public function templateRoot(): ?TemplateRoot
    {
        if ($this->rootResolved) {
            return $this->templateRoot;
        }
        $this->rootResolved = true;
        $root = $this->config->templates ?? $this->env()->get('SHOJIKU_TEMPLATE_ROOT');
        $this->templateRoot = $root === null ? null : new TemplateRoot($root);

        return $this->templateRoot;
    }
}
