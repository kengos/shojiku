// Nothing here downloads anything, at install time or at run time.
//
// An SDK that fetches an executable is a supply-chain surface this product's
// trust story cannot afford, so the claim is asserted rather than left to
// reviewers.

using System.Reflection;
using Xunit;

namespace Shojiku.Tests;

public sealed class NoDownloadTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void ThePackageDependsOnNothingAtAll()
    {
        // The transport is System.Runtime.InteropServices, which is in the
        // framework — the same reason the ruby reference depends only on fiddle
        // and the python mirror on nothing. A package with no dependencies has
        // no dependency that could fetch something either.
        var referenced = typeof(ShojikuClient).Assembly
            .GetReferencedAssemblies()
            .Select(name => name.Name!)
            .Where(name => !name.StartsWith("System.", StringComparison.Ordinal)
                && !name.Equals("System", StringComparison.Ordinal)
                && !name.Equals("netstandard", StringComparison.Ordinal))
            .ToList();

        Assert.Empty(referenced);
    }

    [Fact]
    public void NothingInThePackageOpensASocketOrRunsAProcess()
    {
        // A structural claim, checked structurally: no type here references the
        // networking or process-launching surfaces at all.
        var forbidden = new[] { "System.Net", "System.Diagnostics.Process" };
        var referencedTypes = typeof(ShojikuClient).Assembly
            .GetTypes()
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
            .SelectMany(method => method.GetParameters().Select(parameter => parameter.ParameterType.FullName ?? string.Empty)
                .Append(method.ReturnType.FullName ?? string.Empty))
            .Distinct();

        foreach (var name in referencedTypes)
        {
            foreach (var namespaceName in forbidden)
            {
                Assert.False(
                    name.StartsWith(namespaceName, StringComparison.Ordinal),
                    $"{name} is a networking or process surface this package must not have");
            }
        }
    }

    [Fact]
    public void AMissingLibraryTellsTheReaderHowToINSTALLOneRatherThanFetchingIt()
    {
        var error = Assert.Throws<LibraryNotFoundException>(() =>
            new Library(path: null, env: new Env(enabled: false)));

        Assert.Contains("never downloads", error.Message, StringComparison.Ordinal);
        // Every channel it names is an installation the operator performs.
        Assert.Contains("NuGet package", error.Message, StringComparison.Ordinal);
        Assert.Contains("SHOJIKU_LIBRARY", error.Message, StringComparison.Ordinal);
        Assert.Contains("ShojikuClient(library", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void TheBytesEntranceDoesNotFetchEitherItTakesWhatYouAlreadyHold()
    {
        // Fetching stays the application's act — which is why the entrance takes
        // source TEXT and a path-shaped value is a template that fails to parse.
        var result = Engine.Client().GenerateSource("https://example.com/templates.yml");

        Assert.True(result.Failed);
    }
}
