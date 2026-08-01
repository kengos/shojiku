// Signing, and the four surfaces a secret must not leak through.
//
// Each redaction surface is its own test, because they reach different
// audiences: a caught exception reaches a rescue clause, a printed provider
// reaches a console or a debugger, and a log line reaches an aggregator that
// keeps it for a year.

using Xunit;

namespace Shojiku.Tests;

public sealed class SigningTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void SigningAppendsARevisionRatherThanRewriting()
    {
        var client = Engine.Client();
        var rendered = Engine.Rendered(client);

        var result = client.Sign(rendered, Engine.Signer());

        Assert.True(result.Success);
        // The signed bytes begin with the input byte for byte.
        Assert.Equal(rendered.Bytes, result.Artifact!.Bytes[..rendered.Bytes.Length]);
        Assert.True(result.Artifact.Size > rendered.Size);
    }

    [Fact]
    public async Task SignAsyncProducesASignedDocumentToo()
    {
        var client = Engine.Client();

        var result = await client.SignAsync(Engine.Rendered(client), Engine.Signer());

        Assert.True(result.Success);
    }

    [Fact]
    public void ASignedArtifactHasNoPageCount()
    {
        // Absent, not zero: signing appends a revision to bytes it never laid
        // out, and a zero would read as "a document with no pages".
        Assert.Null(Engine.Signed().PageCount);
    }

    [Fact]
    public void SigningInheritsTheOriginOfWhatItSigned()
    {
        // Appending a revision does not launder where a document came from.
        var client = Engine.Client();
        var rendered = Engine.Rendered(client);
        var fromSource = client.GenerateSource(
            File.ReadAllText(Path.Combine(EngineFixture.Templates, "receipt", "templates.yml")),
            parameters: new { customer = new { name = "Yamada" } }).Unwrap();

        Assert.Equal(Origin.Rendered, client.Sign(rendered, Engine.Signer()).Unwrap().Origin);
        Assert.Equal(Origin.Source, client.Sign(fromSource, Engine.Signer()).Unwrap().Origin);
    }

    [Fact]
    public void TheArtifactCanSignItself()
    {
        Assert.True(Engine.Rendered().Sign(Engine.Signer()).Success);
    }

    [Fact]
    public async Task TheArtifactCanSignItselfAsynchronously()
    {
        Assert.True((await Engine.Rendered().SignAsync(Engine.Signer())).Success);
    }

    [Fact]
    public void AKeyThatCannotBeReadIsAFailedResultNotAnException()
    {
        // A host-side cause, not a bug in the calling program: the file may have
        // been rotated away between deploy and request.
        var client = Engine.Client();
        var missing = new LocalPem(key: Engine.Key("nope.key.pem"), cert: Engine.Key("rsa2048.cert.pem"));

        var result = client.Sign(Engine.Rendered(client), missing);

        Assert.True(result.Failed);
        Assert.Equal(Step.Sign, result.Failure!.Step);
        Assert.Equal("key_unreadable", result.Failure.Kind);
    }

    [Fact]
    public void ACertificateThatCannotBeReadIsAFailedResultToo()
    {
        var client = Engine.Client();
        var missing = new LocalPem(key: Engine.Key("rsa2048.key.pem"), cert: Engine.Key("nope.cert.pem"));

        var result = client.Sign(Engine.Rendered(client), missing);

        Assert.True(result.Failed);
        Assert.Equal("certificate_unreadable", result.Failure!.Kind);
    }

    [Fact]
    public void AKeyTheEngineRefusesIsAFailedResultWithTheEnginesOwnKind()
    {
        var client = Engine.Client();
        var garbage = new LocalPem(
            keyPem: System.Text.Encoding.ASCII.GetBytes("-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n"),
            certPem: File.ReadAllBytes(Engine.Key("rsa2048.cert.pem")));

        var result = client.Sign(Engine.Rendered(client), garbage);

        Assert.True(result.Failed);
        Assert.Equal(Step.Sign, result.Failure!.Step);
    }

    // ---- the four redaction surfaces -------------------------------------

    [Fact]
    public void NoFailureMessageEchoesKeyMaterial()
    {
        // Surface one: what a caught failure carries. The engine builds its
        // refusals from fixed strings, and this binding adds nothing.
        var secret = "SUPERSECRETKEYBODY";
        var client = Engine.Client();
        var garbage = new LocalPem(
            keyPem: System.Text.Encoding.ASCII.GetBytes($"-----BEGIN PRIVATE KEY-----\n{secret}\n-----END PRIVATE KEY-----\n"),
            certPem: File.ReadAllBytes(Engine.Key("rsa2048.cert.pem")),
            passphrase: System.Text.Encoding.ASCII.GetBytes("hunter2"));

        var result = client.Sign(Engine.Rendered(client), garbage);

        Assert.True(result.Failed);
        foreach (var failure in result.Failure!.Causes)
        {
            Assert.DoesNotContain(secret, failure.Message, StringComparison.Ordinal);
            Assert.DoesNotContain("hunter2", failure.Message, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void AProvidersOwnPrintedFormIsRedacted()
    {
        // Surface two: a console, a REPL, a debugger's display, or any log line
        // that interpolates the provider. The path is not secret and is the one
        // thing worth seeing; the bytes never are.
        var provider = new LocalPem(key: "/keys/signer.key", cert: "/keys/signer.crt");

        var printed = provider.ToString();

        Assert.Contains("/keys/signer.key", printed, StringComparison.Ordinal);
        Assert.Contains("passphrase=none", printed, StringComparison.Ordinal);
    }

    [Fact]
    public void AProvidersPrintedFormNeverShowsBytesOrAPassphrase()
    {
        // Surface three, and a different failure than the one above: material
        // held in memory has no path to show, and a passphrase has no safe form
        // at all.
        var provider = new LocalPem(
            keyPem: System.Text.Encoding.ASCII.GetBytes("-----BEGIN PRIVATE KEY-----\nSECRETBODY\n"),
            certPem: System.Text.Encoding.ASCII.GetBytes("-----BEGIN CERTIFICATE-----\nCERTBODY\n"),
            passphrase: System.Text.Encoding.ASCII.GetBytes("hunter2"));

        var printed = provider.ToString();

        Assert.DoesNotContain("SECRETBODY", printed, StringComparison.Ordinal);
        Assert.DoesNotContain("CERTBODY", printed, StringComparison.Ordinal);
        Assert.DoesNotContain("hunter2", printed, StringComparison.Ordinal);
        Assert.Contains("[pem bytes]", printed, StringComparison.Ordinal);
        Assert.Contains("passphrase=[redacted]", printed, StringComparison.Ordinal);
    }

    [Fact]
    public void TheLogChannelNeverCarriesKeyMaterialOrDocumentContent()
    {
        // Surface four, the one that reaches an aggregator and stays there. The
        // channel reports what the BINDING did and nothing about the document.
        var lines = new List<string>();
        var client = Engine.Client(logger: new DelegateLogger(lines.Add));

        var rendered = Engine.Rendered(client);
        client.Sign(rendered, Engine.Signer());

        Assert.NotEmpty(lines);
        var log = string.Join("\n", lines);
        Assert.DoesNotContain("Yamada", log, StringComparison.Ordinal);
        Assert.DoesNotContain("BEGIN PRIVATE KEY", log, StringComparison.Ordinal);
        Assert.DoesNotContain("%PDF", log, StringComparison.Ordinal);
        Assert.Contains("shojiku sign", log, StringComparison.Ordinal);
    }

    // ---- explicit, never sniffed, in both directions ----------------------

    [Fact]
    public void PassingBothFormsOfTheSameMaterialIsProgrammerMisuse()
    {
        // Preferring one would ignore the argument the caller meant, on the path
        // where reading the wrong key matters most.
        Assert.Throws<UsageException>(() =>
            new LocalPem(key: "/k.pem", keyPem: [1, 2, 3], cert: "/c.pem"));
        Assert.Throws<UsageException>(() =>
            new LocalPem(key: "/k.pem", cert: "/c.pem", certPem: [1, 2, 3]));
    }

    [Fact]
    public void PassingNeitherFormIsProgrammerMisuseToo()
    {
        Assert.Throws<UsageException>(() => new LocalPem(cert: "/c.pem"));
        Assert.Throws<UsageException>(() => new LocalPem(key: "/k.pem"));
    }

    [Fact]
    public void MaterialHeldInMemoryNeverTouchesTheFilesystem()
    {
        var provider = new LocalPem(keyPem: [1, 2, 3], certPem: [4, 5, 6]);

        Assert.Equal([1, 2, 3], provider.Key);
        Assert.Equal([4, 5, 6], provider.Certificate);
        Assert.Null(provider.Passphrase);
    }
}
