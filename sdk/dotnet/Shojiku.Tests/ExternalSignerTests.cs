// Signing with a key this process is never given.
//
// The engine hands out bytes, something else signs them, and the finished
// document has to verify. Nothing is stubbed: the delegate here signs with
// .NET's own RSA/ECDsa over a key this package never hands to the engine,
// which is exactly the shape a cloud key service takes from its point of view.

using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Shojiku.Tests;

public sealed class ExternalSignerTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void SigningWithAKeyHeldElsewhereProducesADocumentThatVerifies()
    {
        var client = Engine.Client();
        var rendered = Engine.Rendered(client);

        var result = client.Sign(rendered, External());

        Assert.True(result.Success, result.Failure?.Message);
        // Append-only: the signed bytes begin with the input byte for byte.
        Assert.Equal(rendered.Bytes, result.Artifact!.Bytes[..rendered.Bytes.Length]);
        Assert.True(client.Verify(result.Artifact, anchors: [Engine.Key("rsa2048.cert.pem")]).Success);
    }

    [Fact]
    public void SigningWithAnEllipticCurveKey()
    {
        var client = Engine.Client();

        var result = client.Sign(
            Engine.Rendered(client),
            External("ec256", Algorithm.EcdsaP256Sha256));

        Assert.True(result.Success, result.Failure?.Message);
    }

    [Fact]
    public void TheDelegateIsHandedTheSignedAttributesNotTheDocumentDigest()
    {
        // The distinction the shorthand gets wrong: signing the digest instead
        // produces a document that fails verification.
        var seen = new List<byte[]>();
        var inner = Signing("rsa2048", Algorithm.RsaPkcs1Sha256);
        var client = Engine.Client();

        client.Sign(
            Engine.Rendered(client),
            new ExternalSigner(
                bytes =>
                {
                    seen.Add(bytes);
                    return inner(bytes);
                },
                Algorithm.RsaPkcs1Sha256,
                cert: Engine.Key("rsa2048.cert.pem")));

        var only = Assert.Single(seen);
        // A DER SET OF attributes (RFC 5652's explicit form, tag 0x31), not the
        // 32-byte SHA-256 digest.
        Assert.Equal(0x31, only[0]);
        Assert.NotEqual(32, only.Length);
    }

    [Fact]
    public void ACertificateHeldInMemoryNeverHasToBeWrittenDown()
    {
        var client = Engine.Client();
        var provider = new ExternalSigner(
            Signing("rsa2048", Algorithm.RsaPkcs1Sha256),
            Algorithm.RsaPkcs1Sha256,
            certPem: File.ReadAllBytes(Engine.Key("rsa2048.cert.pem")));

        Assert.True(client.Sign(Engine.Rendered(client), provider).Success);
        Assert.Contains("[pem bytes]", provider.ToString());
    }

    [Fact]
    public void ASignatureWithNothingInItIsRefused()
    {
        var client = Engine.Client();
        var provider = new ExternalSigner(
            _ => [],
            Algorithm.RsaPkcs1Sha256,
            cert: Engine.Key("rsa2048.cert.pem"));

        var error = Assert.Throws<UsageException>(
            () => client.Sign(Engine.Rendered(client), provider));
        Assert.Contains("non-empty signature", error.Message);
    }

    [Fact]
    public void TheDelegatesOwnFailureIsNotFiledAsADocumentFailure()
    {
        // A key service outage is the caller's, not a fact about this document.
        var client = Engine.Client();
        var provider = new ExternalSigner(
            _ => throw new InvalidOperationException("the key service is unreachable"),
            Algorithm.RsaPkcs1Sha256,
            cert: Engine.Key("rsa2048.cert.pem"));

        var error = Assert.Throws<InvalidOperationException>(
            () => client.Sign(Engine.Rendered(client), provider));
        Assert.Equal("the key service is unreachable", error.Message);
    }

    [Fact]
    public void NoSignatureIsAskedForWhenPreparingFailed()
    {
        // An unreadable certificate is a fact about the inputs; paying for a
        // signature afterwards would tell the caller nothing new.
        var asked = false;
        var client = Engine.Client();
        var provider = new ExternalSigner(
            _ =>
            {
                asked = true;
                return [1];
            },
            Algorithm.RsaPkcs1Sha256,
            cert: Path.Combine(Path.GetTempPath(), "no-such-certificate.pem"));

        var result = client.Sign(Engine.Rendered(client), provider);

        Assert.True(result.Failed);
        Assert.False(asked);
    }

    [Fact]
    public void ARefusedDocumentComesBackAsAFailedResultWithNoSignatureAsked()
    {
        // The engine itself refuses: these bytes are not a document it rendered.
        var asked = false;
        var client = Engine.Client();
        var provider = new ExternalSigner(
            _ =>
            {
                asked = true;
                return [1];
            },
            Algorithm.RsaPkcs1Sha256,
            cert: Engine.Key("rsa2048.cert.pem"));

        var result = client.Sign(client.Artifact(Encoding.UTF8.GetBytes("not a PDF")), provider);

        Assert.True(result.Failed);
        Assert.False(asked);
    }

    [Fact]
    public void TheCertificateIsTakenExplicitlyInBothDirections()
    {
        Func<byte[], byte[]> sign = _ => [1];

        Assert.Contains(
            "not both",
            Assert.Throws<UsageException>(() => new ExternalSigner(
                sign, Algorithm.RsaPkcs1Sha256, cert: "a.crt", certPem: [1])).Message);
        Assert.Contains(
            "needs either",
            Assert.Throws<UsageException>(
                () => new ExternalSigner(sign, Algorithm.RsaPkcs1Sha256)).Message);
        Assert.Throws<ArgumentNullException>(
            () => new ExternalSigner(null!, Algorithm.RsaPkcs1Sha256, cert: "a.crt"));
    }

    [Fact]
    public void APayloadThatNamesNoBytesToSignIsRefused()
    {
        // The real engine always reports them, so this is the shape only a
        // different library on the other end could produce.
        Assert.Contains(
            "no bytes to sign",
            Assert.Throws<UsageException>(() => ExternalSigner.BytesToSign("{}")).Message);
        Assert.Contains(
            "no bytes to sign",
            Assert.Throws<UsageException>(
                () => ExternalSigner.BytesToSign("{\"toBeSigned\":7}")).Message);
        Assert.Equal(
            "123"u8.ToArray(),
            ExternalSigner.BytesToSign("{\"toBeSigned\":\"MTIz\"}"));
    }

    [Fact]
    public void ThePrintedFormShowsTheCertificateFormAndTheAlgorithmOnly()
    {
        var shown = External("ec256", Algorithm.EcdsaP256Sha256).ToString();

        Assert.Contains("ec256.cert.pem", shown);
        Assert.Contains("ecdsa-p256-sha256", shown);
    }

    [Fact]
    public void ARegisteredExternalSignerSignsFromAStrictClient()
    {
        // The provider a strict deployment may use is a NAMED one, and an
        // external signer is as nameable as a local key.
        var client = Engine.Client(
            providers: new Dictionary<string, object> { ["kms"] = External() });

        Assert.True(client.Sign(Engine.Rendered(client), "kms").Success);
    }

    [Fact]
    public void ABareExternalSignerIsRefusedByAStrictClient()
    {
        var client = Engine.Client(
            strict: true,
            providers: new Dictionary<string, object> { ["kms"] = External() });

        var error = Assert.Throws<UsageException>(
            () => client.Sign(Engine.Rendered(Engine.Client()), External()));
        Assert.Contains("registered in configuration", error.Message);
    }

    private ExternalSigner External(
        string stem = "rsa2048",
        Algorithm algorithm = Algorithm.RsaPkcs1Sha256) =>
        new(Signing(stem, algorithm), algorithm, cert: Engine.Key($"{stem}.cert.pem"));

    /// <summary>
    /// A stand-in for a key service: signs with a key this package never hands
    /// to the engine. The output is the raw operation's, which is what both
    /// major cloud key services return.
    /// </summary>
    private Func<byte[], byte[]> Signing(string stem, Algorithm algorithm)
    {
        var pem = File.ReadAllText(Engine.Key($"{stem}.key.pem"));
        return toBeSigned =>
        {
            if (algorithm == Algorithm.RsaPkcs1Sha256)
            {
                using var rsa = RSA.Create();
                rsa.ImportFromPem(pem);
                return rsa.SignData(toBeSigned, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            }

            using var ecdsa = ECDsa.Create();
            ecdsa.ImportFromPem(pem);
            return ecdsa.SignData(toBeSigned, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
        };
    }
}
