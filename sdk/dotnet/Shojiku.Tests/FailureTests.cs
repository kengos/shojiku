// The failure trace: a value, with the chain underneath it inspectable rather
// than unwound.

using Xunit;

namespace Shojiku.Tests;

public sealed class FailureTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void AFailureReadsItselfOffTheEnginesErrorPayload()
    {
        var failure = Failure.FromErrorJson("""{"kind":"render_failed","message":"no font"}""", Step.Generate);

        Assert.Equal(Step.Generate, failure.Step);
        Assert.Equal("render_failed", failure.Kind);
        Assert.Equal("no font", failure.Message);
    }

    [Fact]
    public void AnAbsentOrEmptyPayloadStillProducesAUsableFailure()
    {
        foreach (var payload in new string?[] { null, "" })
        {
            var failure = Failure.FromErrorJson(payload, Step.Verify);

            Assert.Equal("unknown", failure.Kind);
            Assert.Equal(string.Empty, failure.Message);
        }
    }

    [Fact]
    public void APayloadMissingItsKeysFallsBackRatherThanThrowing()
    {
        var failure = Failure.FromErrorJson("""{"other":1}""", Step.Sign);

        Assert.Equal("unknown", failure.Kind);
        Assert.Equal(string.Empty, failure.Message);
    }

    [Fact]
    public void CausesFlattenTheChainOutermostFirst()
    {
        // What you log when you want the whole story rather than only its
        // headline.
        var root = new Failure(Step.Generate, "io", "disk");
        var middle = new Failure(Step.Generate, "template_unreadable", "unreadable", null, root);
        var outer = new Failure(Step.Generate, "template_name", "refused", null, middle);

        Assert.Equal(["refused", "unreadable", "disk"], outer.Causes.Select(item => item.Message));
        Assert.Single(root.Causes);
    }

    [Fact]
    public void AFailurePrintsItsStepAndKind()
    {
        Assert.Equal("sign/key_unreadable: nope", new Failure(Step.Sign, "key_unreadable", "nope").ToString());
    }

    [Fact]
    public void TheStepVocabularyIsTheSdksOwnThreeAndNothingElse()
    {
        // The engine's error object names an INTERNAL stage (render, validate).
        // Passing it through would make this field mean different things
        // depending on which layer refused.
        Assert.Equal(
            ["Generate", "Sign", "Verify"],
            Enum.GetNames<Step>());
    }
}
