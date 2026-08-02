<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Exception\UsageException;
use Shojiku\Step;
use Shojiku\VerificationCheck;
use Shojiku\VerificationReport;

final class VerificationTest extends TestCase
{
    use EngineFixtures;

    public function testAValidSignatureVerifiesAgainstItsAnchor(): void
    {
        $result = $this->signed()->verify(anchors: $this->keyPath('rsa2048.cert.pem'));

        self::assertTrue($result->success());
        $report = $result->report();
        self::assertNotNull($report);
        self::assertTrue($report->valid());
        self::assertTrue($report->signature()->passed());
        self::assertTrue($report->coverage()->passed());
        self::assertTrue($report->certificateValidity()->passed());
        self::assertTrue($report->trustChain()->passed());
    }

    public function testWhatWasNotCheckedSurvivesAPassingVerdict(): void
    {
        $report = $this->signed()->verify(anchors: $this->keyPath('rsa2048.cert.pem'))->report();

        self::assertNotNull($report);
        self::assertContains('revocation', $report->notChecked());
        self::assertContains('timestamp', $report->notChecked());
    }

    public function testATamperedDocumentIsAFailedResultThatStillCarriesItsReport(): void
    {
        // The byte is flipped INSIDE the original body, indexed from the
        // pre-signature length: signing APPENDS a revision, so a flip at the
        // file's midpoint would land in the appended part and leave a
        // container the verifier cannot parse a signature out of at all —
        // which is a different outcome from the one this pins.
        $original = $this->rendered()->bytes();
        $tampered = $this->signed()->bytes();
        $at = intdiv(strlen($original), 2);
        // The mask is for the ANALYSER, not the arithmetic: xor-ing two values
        // that are each at most 0xff cannot exceed 0xff, but phpstan does not
        // narrow an integer range across `^`, so on PHP 8.5 it reads the result
        // as a plain int and `chr` now declares `int<0, 255>`.
        $tampered[$at] = chr((ord($tampered[$at]) ^ 0x20) & 0xFF);

        $result = $this->client()->artifact($tampered)
            ->verify(anchors: $this->keyPath('rsa2048.cert.pem'));

        // A signature that does not verify is a FAILED result — a caller who
        // checks only success() is not told a forgery is fine.
        self::assertTrue($result->failed());
        $failure = $result->failure();
        self::assertNotNull($failure);
        self::assertSame(Step::Verify, $failure->step());
        self::assertSame('signature', $failure->kind());

        // …and the report rides that failed result, because `notChecked` has
        // to reach the caller either way.
        $report = $result->report();
        self::assertNotNull($report);
        self::assertFalse($report->valid());
        self::assertFalse($report->signature()->passed());
        self::assertNotNull($report->signature()->reason());
        self::assertTrue($report->coverage()->passed());
        self::assertContains('revocation', $report->notChecked());
    }

    public function testADocumentThatCannotBeEvaluatedHasNoReportAtAll(): void
    {
        // Different from an empty report: nothing was checked, so there is
        // nothing to say about what was not checked.
        $result = $this->rendered()->verify(anchors: $this->keyPath('rsa2048.cert.pem'));

        self::assertTrue($result->failed());
        self::assertNull($result->report());
        self::assertSame('verify', $result->failure()?->kind());
    }

    public function testAnchorsCrossAsPathsOrAsBytes(): void
    {
        $pem = (string) file_get_contents($this->keyPath('rsa2048.cert.pem'));

        self::assertTrue($this->signed()->verify(anchorsPem: $pem)->success());
        self::assertTrue($this->signed()->verify(anchors: [$this->keyPath('rsa2048.cert.pem')])->success());
    }

    public function testAnUntrustedAnchorFailsTheChainRatherThanTheSignature(): void
    {
        $result = $this->signed()->verify(anchors: $this->keyPath('other-ca.cert.pem'));

        self::assertTrue($result->failed());
        $report = $result->report();
        self::assertNotNull($report);
        self::assertTrue($report->signature()->passed());
        self::assertFalse($report->trustChain()->passed());
        // "The signature is valid but nobody we trust vouches for it" is a
        // different fact from "the signature is wrong", and a caller that
        // cannot tell them apart cannot explain the answer to anyone.
        self::assertNotSame('', (string) $report->trustChain());
    }

    public function testBothAnchorFormsAtOnceIsProgrammerMisuse(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/either `anchors:` \(paths\) or `anchorsPem:` \(bytes\), not both/');
        $this->signed()->verify(anchors: '/a.pem', anchorsPem: 'bytes');
    }

    public function testNoAnchorAtAllIsProgrammerMisuse(): void
    {
        // There is deliberately no fallback to the machine's trust store: the
        // engine never consults one, so a default would answer a different
        // question than the caller asked.
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/verify needs/');
        $this->signed()->verify();
    }

    public function testAnEmptyAnchorListIsProgrammerMisuseToo(): void
    {
        // The same statement as none at all — and if it reached the engine it
        // would come back as a refused INVOCATION, which a caller would read
        // as a transport failure rather than as the misuse it is.
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/verify needs/');
        $this->signed()->verify(anchors: []);
    }

    public function testAnUnreadableAnchorIsAFailedResult(): void
    {
        $result = $this->signed()->verify(anchors: $this->keyPath('no-such-anchor.pem'));

        self::assertTrue($result->failed());
        self::assertSame('io', $result->failure()?->kind());
    }

    public function testACheckWithoutAReasonPrintsItsStatusAlone(): void
    {
        $passed = VerificationCheck::parse(['status' => 'passed']);
        $failed = VerificationCheck::parse(['status' => 'failed', 'reason' => 'the digest differs']);

        self::assertSame('passed', (string) $passed);
        self::assertNull($passed->reason());
        self::assertSame('failed: the digest differs', (string) $failed);
        self::assertFalse($failed->passed());
    }

    public function testAMalformedCheckIsEmptyRatherThanGuessedAt(): void
    {
        $check = VerificationCheck::parse('not an object');

        self::assertNull($check->status());
        self::assertFalse($check->passed());
        self::assertSame('', (string) $check);
    }

    public function testAReportExposesItsChecksAsAMapAsWellAsSeparately(): void
    {
        $report = VerificationReport::parse([
            'valid' => true,
            'signature' => ['status' => 'passed'],
            'coverage' => ['status' => 'passed'],
            'certificateValidity' => ['status' => 'passed'],
            'trustChain' => ['status' => 'passed'],
            'notChecked' => ['revocation', 42],
        ]);

        self::assertSame(
            ['signature', 'coverage', 'certificateValidity', 'trustChain'],
            array_keys($report->checks()),
        );
        // A non-string entry is dropped rather than cast: the list is the
        // engine's vocabulary, not free text.
        self::assertSame(['revocation'], $report->notChecked());
    }

    public function testAReportWithoutAValidFlagIsNotValid(): void
    {
        $report = VerificationReport::parse([]);

        self::assertFalse($report->valid());
        self::assertSame([], $report->notChecked());
    }

    public function testALockedDownClientCanStillVerifyAnythingItIsGiven(): void
    {
        // Verification is NEVER restricted: verifying bytes of unknown
        // provenance is the point of verify, and a locked-down deployment is
        // precisely the one that must check an archived document it did not
        // produce.
        $strict = $this->client(['strict' => true]);
        $archived = $strict->artifact($this->signed()->bytes());

        self::assertTrue($archived->verify(anchors: $this->keyPath('rsa2048.cert.pem'))->success());
    }
}
