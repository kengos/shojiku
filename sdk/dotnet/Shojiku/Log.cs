// The optional host-side log channel.
//
// Silent unless an application supplies a logger, and deliberately narrow: it
// reports what the BINDING did — which library it loaded, which ABI revision it
// found, which lifecycle step ran and for how long — and never what the document
// contained. Params, rendered bytes, diagnostics and key material are all
// outside this channel BY RULE, because a log line is the easiest way for a
// secret to leave a process, and because a diagnostic belongs to the result the
// caller already has.
//
// What does cross is bounded first, so a hostile template name cannot smuggle
// control characters into a log file.
//
// The interface is one method, so this package's dependency list stays at
// exactly zero entries — wiring it to Microsoft.Extensions.Logging, Serilog or
// anything else is a lambda at the call site. The cross-language rule the other
// six mirror: each SDK accepts its ecosystem's standard logger interface,
// optionally; where a language cannot duck-type, the smallest interface that
// costs no dependency is that answer.

using System.Diagnostics;

namespace Shojiku;

/// <summary>Anything that can be told something at debug level.</summary>
public interface IShojikuLogger
{
    /// <summary>Record one host event.</summary>
    /// <param name="message">What the binding did. Never document content.</param>
    void Debug(string message);
}

/// <summary>An <see cref="IShojikuLogger"/> over any delegate — the one-line adapter.</summary>
public sealed class DelegateLogger : IShojikuLogger
{
    private readonly Action<string> write;

    /// <summary>Creates a logger that hands every message to <paramref name="write"/>.</summary>
    public DelegateLogger(Action<string> write) => this.write = write;

    /// <inheritdoc />
    public void Debug(string message) => write(message);
}

/// <summary>Host events, or silence.</summary>
internal sealed class Log
{
    private readonly IShojikuLogger? logger;

    internal Log(IShojikuLogger? logger = null) => this.logger = logger;

    /// <summary>
    /// Record one host event.
    /// </summary>
    /// <remarks>
    /// The message is built only when someone is listening: a silent log costs
    /// a null check, not string formatting.
    /// </remarks>
    internal void Event(string name, params (string Key, object? Value)[] fields)
    {
        if (logger is null)
        {
            return;
        }

        var message = new System.Text.StringBuilder("shojiku ").Append(name);
        foreach (var (key, value) in fields)
        {
            message.Append(' ').Append(key).Append('=').Append(value);
        }

        logger.Debug(message.ToString());
    }

    /// <summary>
    /// Time one lifecycle operation and return what it returned.
    /// </summary>
    /// <remarks>
    /// The operation is expected to produce a result, whose verdict is recorded
    /// as <c>ok</c> — the one thing worth knowing about an operation that is not
    /// its content.
    /// </remarks>
    internal Result<T> Timed<T>(string name, Func<Result<T>> operation, params (string Key, object? Value)[] fields)
        where T : class
    {
        var started = Stopwatch.GetTimestamp();
        var result = operation();
        var elapsed = Math.Round(Stopwatch.GetElapsedTime(started).TotalMilliseconds, 1);
        Event(name, [.. fields, ("ms", elapsed), ("ok", result.Success)]);
        return result;
    }
}
