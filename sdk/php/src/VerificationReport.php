<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * What verification found — INCLUDING what it did not look at.
 *
 * `notChecked` is a field, not a footnote, and this binding passes it through
 * untouched. A "valid" verdict that quietly skipped revocation is worse than
 * no verifier at all: it turns a missing capability into a false assurance,
 * which is exactly the trust a signing feature sells. Dropping it on the way
 * through an SDK would be the same lie one layer up.
 *
 * The four checks stay separate for the same reason. "The signature is valid
 * but covers only part of the file" is a different fact from "the signature
 * is wrong", and a caller that cannot tell them apart cannot explain the
 * answer to anyone.
 */
final class VerificationReport
{
    /**
     * @param list<string> $notChecked
     */
    private function __construct(
        private readonly bool $valid,
        private readonly VerificationCheck $signature,
        private readonly VerificationCheck $coverage,
        private readonly VerificationCheck $certificateValidity,
        private readonly VerificationCheck $trustChain,
        private readonly array $notChecked,
    ) {
    }

    /**
     * @param array<mixed> $payload the decoded `verification` object
     */
    public static function parse(array $payload): self
    {
        $notChecked = [];
        if (isset($payload['notChecked']) && is_array($payload['notChecked'])) {
            foreach ($payload['notChecked'] as $item) {
                if (is_string($item)) {
                    $notChecked[] = $item;
                }
            }
        }

        return new self(
            ($payload['valid'] ?? null) === true,
            VerificationCheck::parse($payload['signature'] ?? null),
            VerificationCheck::parse($payload['coverage'] ?? null),
            VerificationCheck::parse($payload['certificateValidity'] ?? null),
            VerificationCheck::parse($payload['trustChain'] ?? null),
            $notChecked,
        );
    }

    /**
     * Whether every check this release PERFORMS passed. Read `notChecked`
     * beside it: this is not "the document is trustworthy", it is "nothing we
     * looked at was wrong".
     */
    public function valid(): bool
    {
        return $this->valid;
    }

    public function signature(): VerificationCheck
    {
        return $this->signature;
    }

    public function coverage(): VerificationCheck
    {
        return $this->coverage;
    }

    public function certificateValidity(): VerificationCheck
    {
        return $this->certificateValidity;
    }

    public function trustChain(): VerificationCheck
    {
        return $this->trustChain;
    }

    /**
     * What this release did NOT check. Carried on a failing verdict too.
     *
     * @return list<string>
     */
    public function notChecked(): array
    {
        return $this->notChecked;
    }

    /**
     * @return array<string, VerificationCheck>
     */
    public function checks(): array
    {
        return [
            'signature' => $this->signature,
            'coverage' => $this->coverage,
            'certificateValidity' => $this->certificateValidity,
            'trustChain' => $this->trustChain,
        ];
    }
}
