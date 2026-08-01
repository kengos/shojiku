// Verification, and the no-false-assurance rule that shapes it.
//
// A signature that does not verify is a FAILED result — so a caller who checks
// only Success is never told a forgery is fine — and the report rides that
// failed result, because `NotChecked` must reach the caller either way.

using Xunit;

namespace Shojiku.Tests;

public sealed class VerificationTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void AGoodSignatureVerifiesAgainstTheCertificateThatSignedIt()
    {
        var client = Engine.Client();

        var result = client.Verify(Engine.Signed(client), anchors: [Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Success);
        Assert.NotNull(result.Report);
        Assert.True(result.Report!.Valid);
        Assert.True(result.Report.Signature.Passed);
        Assert.True(result.Report.Coverage.Passed);
    }

    [Fact]
    public async Task VerifyAsyncAnswersTheSame()
    {
        var client = Engine.Client();

        var result = await client.VerifyAsync(Engine.Signed(client), anchors: [Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Success);
    }

    [Fact]
    public void ThePassingVerdictStillNamesWhatWasNotChecked()
    {
        // The no-false-assurance rule on the PASSING path, which is the one a
        // binding is most likely to quietly drop.
        var client = Engine.Client();

        var report = client.Verify(Engine.Signed(client), anchors: [Engine.Key("rsa2048.cert.pem")]).Unwrap();

        Assert.Equal(["revocation", "timestamp"], report.NotChecked);
    }

    [Fact]
    public void TheFAILINGVerdictNamesThemToo()
    {
        // The other half, and the whole point of carrying NotChecked: it must
        // reach the caller either way, so the report rides a FAILED result too.
        var client = Engine.Client();

        var result = client.Verify(Tampered(client), anchors: [Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Failed);
        Assert.NotNull(result.Report);
        Assert.Equal(["revocation", "timestamp"], result.Report!.NotChecked);
    }

    [Fact]
    public void AlteredBytesFailTheResultAndSayWhichCheck()
    {
        // The four checks stay separate: "valid but covers only part of the
        // file" is a different fact from "the signature is wrong".
        var client = Engine.Client();

        var result = client.Verify(Tampered(client), anchors: [Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Failed);
        Assert.False(result.Report!.Valid);
        Assert.False(result.Report.Signature.Passed);
        Assert.True(result.Report.Coverage.Passed);
        Assert.Equal("signature", result.Failure!.Kind);
        Assert.Equal(Step.Verify, result.Failure.Step);
    }

    [Fact]
    public void TheFourChecksHaveNamesACallerCanBranchOn()
    {
        var client = Engine.Client();

        var report = client.Verify(Engine.Signed(client), anchors: [Engine.Key("rsa2048.cert.pem")]).Unwrap();

        Assert.Equal(
            ["CertificateValidity", "Coverage", "Signature", "TrustChain"],
            report.Checks.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void AnAnchorThatSignedNothingHereFailsTheChain()
    {
        var client = Engine.Client();

        var result = client.Verify(Engine.Signed(client), anchors: [Engine.Key("other-ca.cert.pem")]);

        Assert.True(result.Failed);
        Assert.NotNull(result.Report);
        Assert.False(result.Report!.TrustChain.Passed);
    }

    [Fact]
    public void AChainIssuedLeafVerifiesAgainstItsAuthority()
    {
        var client = Engine.Client();
        var leaf = new LocalPem(key: Engine.Key("leaf.key.pem"), cert: Engine.Key("leaf.cert.pem"));
        var document = client.Sign(Engine.Rendered(client), leaf).Unwrap();

        var result = client.Verify(document, anchors: [Engine.Key("ca.cert.pem")]);

        Assert.True(result.Success);
        Assert.True(result.Unwrap().TrustChain.Passed);
    }

    [Fact]
    public void AnExpiredCertificateFailsVALIDITYRatherThanTheSignature()
    {
        var client = Engine.Client();
        var expired = new LocalPem(key: Engine.Key("leaf.key.pem"), cert: Engine.Key("leaf-expired.cert.pem"));
        var document = client.Sign(Engine.Rendered(client), expired).Unwrap();

        var report = client.Verify(document, anchors: [Engine.Key("ca.cert.pem")]).Report;

        Assert.NotNull(report);
        Assert.False(report!.CertificateValidity.Passed);
        Assert.True(report.Signature.Passed);
    }

    [Fact]
    public void ADocumentWithNoSignatureInItGivesNOReportAtAll()
    {
        // A document that cannot be evaluated at all has NO report, which is a
        // different fact from an empty one.
        var client = Engine.Client();

        var result = client.Verify(client.Artifact(Engine.Rendered(client).Bytes), anchors: [Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Failed);
        Assert.Null(result.Report);
    }

    [Fact]
    public void SeveralAnchorFilesAreTakenAtOnceAsTheCliTakesSeveralFlags()
    {
        var client = Engine.Client();

        var result = client.Verify(
            Engine.Signed(client),
            anchors: [Engine.Key("other-ca.cert.pem"), Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Success);
    }

    [Fact]
    public void AnchorsMayBeBytesForACertificateThatNeverTouchedDisk()
    {
        var client = Engine.Client();

        var result = client.Verify(
            Engine.Signed(client),
            anchorsPem: File.ReadAllBytes(Engine.Key("rsa2048.cert.pem")));

        Assert.True(result.Success);
    }

    [Fact]
    public void UnusableAnchorBytesAreAFailedResult()
    {
        var client = Engine.Client();

        var result = client.Verify(Engine.Signed(client), anchorsPem: System.Text.Encoding.ASCII.GetBytes("not a pem at all"));

        Assert.True(result.Failed);
        Assert.Equal("anchors", result.Failure!.Kind);
    }

    [Fact]
    public void AnUnreadableAnchorFileIsAFailedResultNotAnException()
    {
        var client = Engine.Client();

        var result = client.Verify(Engine.Signed(client), anchors: ["/nonexistent/anchor.pem"]);

        Assert.True(result.Failed);
        Assert.Equal("anchor_unreadable", result.Failure!.Kind);
        Assert.Equal(Step.Verify, result.Failure.Step);
    }

    [Fact]
    public void AnchorsAreRequiredBecauseThereIsNoTrustStoreToFallBackOn()
    {
        // The engine never consults the machine's trust store, so a default
        // would answer a different question than the caller asked.
        var client = Engine.Client();

        var error = Assert.Throws<UsageException>(() => client.Verify(Engine.Signed(client)));

        Assert.Contains("needs", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void PassingBothAnchorFormsIsProgrammerMisuse()
    {
        // Preferring one would ignore the argument the caller meant, on the path
        // where trusting the wrong anchor matters most.
        var client = Engine.Client();

        Assert.Throws<UsageException>(() =>
            client.Verify(Engine.Signed(client), anchors: ["/a.pem"], anchorsPem: [1, 2, 3]));
    }

    [Fact]
    public void TheArtifactCanVerifyItself()
    {
        var client = Engine.Client();

        Assert.True(Engine.Signed(client).Verify(anchors: [Engine.Key("rsa2048.cert.pem")]).Success);
    }

    [Fact]
    public async Task TheArtifactCanVerifyItselfAsynchronously()
    {
        var client = Engine.Client();

        Assert.True((await Engine.Signed(client).VerifyAsync(anchors: [Engine.Key("rsa2048.cert.pem")])).Success);
    }

    [Fact]
    public void AnArchivedDocumentVerifiesAfterReEntry()
    {
        // The whole point of `Artifact(bytes)`: a document signed some time ago,
        // read back from wherever it was stored — and verification is never
        // restricted, so even a strict client can check it.
        var client = Engine.Client(strict: true, providers: new Dictionary<string, object>(StringComparer.Ordinal));
        var archived = Engine.Signed().Bytes;

        var result = client.Artifact(archived).Verify(anchors: [Engine.Key("rsa2048.cert.pem")]);

        Assert.True(result.Success);
    }

    /// <summary>
    /// A signed document with one byte of the ORIGINAL body flipped.
    /// </summary>
    /// <remarks>
    /// Corrupting the middle of the SIGNED file lands in the appended revision
    /// instead, which leaves a container the verifier cannot parse a signature
    /// out of at all — no report, which is a different outcome from the one
    /// these tests are about.
    /// </remarks>
    private DocumentArtifact Tampered(ShojikuClient client)
    {
        var rendered = Engine.Rendered(client);
        var signed = client.Sign(rendered, Engine.Signer()).Unwrap();
        var bytes = signed.Bytes.ToArray();
        bytes[rendered.Bytes.Length / 2] ^= 0xFF;
        return client.Artifact(bytes);
    }
}
