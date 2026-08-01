// What this client guarantees when several threads use it.
//
// Stated, not assumed: the capi header's THREADING section says the operations
// are concurrency-safe and a handle is single-owner, and this binding never
// shares a handle across a call. What that buys an application is here.

using Xunit;

namespace Shojiku.Tests;

public sealed class ConcurrencyTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void OneClientRendersFromFourThreadsAndTheBytesAgree()
    {
        // The same assertion the capi's own suite makes, one layer up: four
        // threads, one client, byte-identical documents. A binding that shared a
        // result handle across calls would produce torn output here.
        var client = Engine.Client();
        var parameters = new { customer = new { name = "Yamada Shoji K.K." } };
        var expected = client.Generate("receipt", parameters).Unwrap().Bytes;

        var produced = new byte[4][];
        Parallel.For(0, 4, index =>
        {
            produced[index] = client.Generate("receipt", parameters).Unwrap().Bytes;
        });

        foreach (var bytes in produced)
        {
            Assert.Equal(expected, bytes);
        }
    }

    [Fact]
    public void ConcurrentFailuresFreeTheirHandlesToo()
    {
        // The failure path is the one a leak hides in: nothing reads a buffer,
        // so nothing notices the handle that was never released.
        var client = Engine.Client();

        Parallel.For(0, 8, _ =>
        {
            Assert.True(client.Generate("broken").Failed);
        });
    }

    [Fact]
    public async Task TheAsyncSurfaceRunsSeveralRendersAtOnce()
    {
        // Which is the point of having one: rendering is CPU work, and a
        // request-handling runtime must not block a thread for its duration.
        var client = Engine.Client();

        var results = await Task.WhenAll(
            Enumerable.Range(0, 4).Select(_ => client.GenerateAsync("receipt")));

        Assert.All(results, result => Assert.True(result.Success));
    }
}
