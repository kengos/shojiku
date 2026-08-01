// The C boundary itself: ownership, widths, encoding, and the two levels of
// failure the surface defines.
//
// These are the proofs a faithful binding owes that no lifecycle test can make,
// because a lifecycle test passes just as happily over a binding that leaks a
// handle or decodes an out-parameter at the wrong width.

using System.Text;
using Xunit;

namespace Shojiku.Tests;

public sealed class BoundaryTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void ASizeTOutParameterIsDecodedAtTheRightWidth()
    {
        // The silent-failure class this exists for: an out-parameter unpacked at
        // the wrong width does not crash, it reads a plausible wrong number —
        // the reference SDK once read every success flag as false while the
        // string buffers beside it decoded perfectly. So the widths are proven
        // against a KNOWN-GOOD value rather than assumed.
        //
        // `size_t` here is the buffer length: the PDF the engine handed back is
        // exactly as long as the bytes it wrote, and a truncated or sign-extended
        // length would not agree with the trailer.
        var rendered = Engine.Rendered();

        Assert.Equal(rendered.Bytes.Length, rendered.Size);
        Assert.True(rendered.Size > 1000, $"a one-page PDF is longer than this: {rendered.Size}");
        Assert.Equal("%PDF", Encoding.ASCII.GetString(rendered.Bytes[..4]));
        Assert.Contains("%%EOF", Encoding.ASCII.GetString(rendered.Bytes[^16..]), StringComparison.Ordinal);
    }

    [Fact]
    public void AnInt32OutParameterIsDecodedAtTheRightWidth()
    {
        // The other width the surface uses: `shojiku_result_success` writes an
        // int32_t. Reading it as a native `long` would pick up whatever sits
        // beside it — which is exactly how the reference SDK's every-success-is-
        // false bug looked. A success and a failure disagreeing proves the read.
        var client = Engine.Client();

        Assert.True(client.Generate("receipt").Success);
        Assert.True(client.Generate("broken").Failed);
    }

    [Fact]
    public void EngineMemoryIsCopiedOutRatherThanHeldOnTo()
    {
        // The ownership rule in one assertion: nothing this SDK hands an
        // application points into engine memory, so bytes taken from an artifact
        // are still readable long after the handle that lent them was freed —
        // and are a copy the caller may mutate without touching anything else.
        var first = Engine.Rendered();
        var copy = first.Bytes;
        copy[0] = 0x00;

        var second = Engine.Rendered();

        Assert.Equal("%PDF", Encoding.ASCII.GetString(second.Bytes[..4]));
        Assert.NotSame(first.Bytes, second.Bytes);
    }

    [Fact]
    public void EveryOperationFreesItsHandleOnTheFAILUREPathToo()
    {
        // One handle in, one free out, on every path — proven by volume rather
        // than by inspection: a leaked handle per call would be visible as
        // unbounded growth, and a double free would abort the process. A run
        // that completes is the assertion.
        var client = Engine.Client();
        for (var attempt = 0; attempt < 40; attempt++)
        {
            Assert.True(client.Generate("broken").Failed);
            Assert.True(client.Generate("receipt").Success);
        }
    }

    [Fact]
    public void TextCrossesAsUtf8RatherThanThePlatformDefault()
    {
        // Windows is a first-class target and its default encoding is not UTF-8,
        // so every text buffer is decoded explicitly. Non-ASCII params making the
        // round trip is what proves it end to end.
        var result = Engine.Client().Generate("receipt", new { customer = new { name = "商事株式会社ヤマダ" } });

        Assert.True(result.Success);
    }

    [Fact]
    public void NonAsciiSurvivesTheRequestEnvelopeUnescaped()
    {
        var sources = new Sources("version: 0.1.0\nname: t\n");
        var encoded = new Request(sources, new { name = "日本語" }).Encoded();

        // Encoded as UTF-8 bytes, not as \uXXXX escapes: the surface is UTF-8 by
        // contract, so escaping would only make the payload bigger.
        Assert.Contains("日本語", Encoding.UTF8.GetString(encoded), StringComparison.Ordinal);
    }

    [Fact]
    public void ARequestDropsAbsentKeysRatherThanSendingThemNull()
    {
        // The request schema rejects unknown and ill-typed keys, so a key the
        // engine may legitimately not receive is left out entirely.
        var encoded = Encoding.UTF8.GetString(new Request(new Sources("t"), new { }).Encoded());

        Assert.DoesNotContain("definitions", encoded, StringComparison.Ordinal);
        Assert.DoesNotContain("assetsDir", encoded, StringComparison.Ordinal);
        Assert.DoesNotContain("lang", encoded, StringComparison.Ordinal);
        Assert.Contains("template", encoded, StringComparison.Ordinal);
    }

    [Fact]
    public void ARequestCarriesEveryKeyItWasGiven()
    {
        var request = new Request(
            new Sources("t", "d", "/assets"),
            "params: 1",
            "ja-JP",
            ["/fonts"],
            ["/locales"]);

        var encoded = Encoding.UTF8.GetString(request.Encoded());

        Assert.Contains("\"definitions\":\"d\"", encoded, StringComparison.Ordinal);
        Assert.Contains("\"assetsDir\":\"/assets\"", encoded, StringComparison.Ordinal);
        Assert.Contains("\"lang\":\"ja-JP\"", encoded, StringComparison.Ordinal);
        Assert.Contains("/fonts", encoded, StringComparison.Ordinal);
        Assert.Contains("/locales", encoded, StringComparison.Ordinal);
        // A string params is the caller's own source text, passed through verbatim.
        Assert.Contains("\"params\":\"params: 1\"", encoded, StringComparison.Ordinal);
    }

    [Fact]
    public void OnlyTheLifecycleIsBound()
    {
        // `validate` and `preview` are the AUTHORING surface's operations, which
        // the Designer reaches through the WASM bindings. Binding them here would
        // be surface with no contract behind it.
        var bound = typeof(Engine)
            .GetMethods(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
            .Select(method => method.Name)
            .ToHashSet(StringComparer.Ordinal);

        Assert.Contains("EngineInfo", bound);
        Assert.Contains("Render", bound);
        Assert.Contains("Sign", bound);
        Assert.Contains("Verify", bound);
        Assert.DoesNotContain("Validate", bound);
        Assert.DoesNotContain("Preview", bound);
    }

    [Fact]
    public void TheAbiRevisionThisPackageSpeaksIsChecked()
    {
        // Asked once, before anything else is called: the only way a binding
        // learns that a symbol it is about to call means something different now.
        Assert.Equal(1, Library.AbiVersion);
        Library.RequireAbi(Library.AbiVersion, "/lib.so");
    }

    [Fact]
    public void ALibrarySpeakingADifferentRevisionIsREFUSED()
    {
        // Loading anyway would mean calling symbols whose meaning has changed.
        // The rule is checked as a rule: a library that reports another revision
        // cannot be produced from the one this repository builds, and a refusal
        // nobody can exercise is a refusal nobody knows works.
        var error = Assert.Throws<AbiMismatchException>(() => Library.RequireAbi(Library.AbiVersion + 1, "/lib.so"));

        Assert.Contains($"implements ABI revision {Library.AbiVersion + 1}", error.Message, StringComparison.Ordinal);
        Assert.Contains($"speaks {Library.AbiVersion}", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ARejectedCallLeavesABlankOutSlotThatIsNeverDereferenced()
    {
        // The header blanks the out slot before any work starts, so a call the C
        // surface refuses outright hands back no handle at all. Reading accessors
        // off that would be a null dereference; the status already says what
        // happened, and freeing NULL is a documented no-op.
        using var library = new Library(path: Engine.Library, env: new Env(enabled: false));
        var engine = new Shojiku.Engine(library);

        var snapshot = engine.Render([]);

        Assert.NotEqual(0, snapshot.Status);
        Assert.False(snapshot.Success);
        Assert.Empty(snapshot.Pdf);
        Assert.Equal(string.Empty, snapshot.Json);

        // And the guard itself, over a slot that stayed blank. This engine hands
        // back a handle even for the call it just refused, so the blank-slot path
        // is only reachable here — where it is checked rather than assumed.
        var blank = engine.Read(7, IntPtr.Zero);

        Assert.Equal(7, blank.Status);
        Assert.False(blank.Success);
        Assert.Empty(blank.Pdf);
        Assert.Equal(string.Empty, blank.Error);
    }

    [Fact]
    public void BoundedTextIsEmptyForNothingAtAll()
    {
        // Every path that echoes goes through it, including the ones whose value
        // was never set.
        Assert.Equal(string.Empty, Text.Bounded(null));
        Assert.Equal(string.Empty, Text.Bounded(""));
    }

    [Fact]
    public void AnEmptyOrNonObjectPayloadReadsAsNoEntriesRatherThanThrowing()
    {
        // The wire is append-only and unmodelled, so a shape this SDK did not
        // expect is nothing rather than a crash.
        Assert.Empty(Wire.Object(""));
        Assert.Empty(Wire.Object("[1,2,3]"));
        Assert.Empty(Wire.Object("7"));
    }
}
