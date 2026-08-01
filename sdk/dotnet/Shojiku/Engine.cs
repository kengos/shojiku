// The declared C surface, and the one place a call crosses into it.
//
// WHY FUNCTION POINTERS RATHER THAN [LibraryImport]
//
// The source-generated marshalling of [LibraryImport] names its library at
// COMPILE time and resolves it through one process-wide DllImportResolver. This
// binding's resolution order is per CLIENT — SHOJIKU_LIBRARY beats explicit
// configuration beats the copy inside the platform package — and a test suite
// builds clients over different libraries in one process. So entry points are
// resolved here, by hand, and held as `delegate* unmanaged[Cdecl]`. That keeps
// what the preference is actually for: complete explicit signatures, blittable
// arguments only, and no marshalling guesswork. What it costs is one `unsafe`
// block, confined to this file and Library.cs.
//
// Every signature below is written from engine/capi/include/shojiku.h, widths
// included. `size_t` is `nuint`, not `ulong`: they agree on the platforms in the
// matrix and stop agreeing the moment one does not, and an out-parameter decoded
// at the wrong width fails SILENTLY — the reference SDK once read every success
// flag as false while the string buffers beside it decoded perfectly.
//
// No `bool` crosses: the C surface reports success as `int32_t`, and .NET's
// default marshalling of `bool` is the 4-byte Win32 BOOL, which is a coincidence
// rather than a contract.

using System.Runtime.InteropServices;

namespace Shojiku;

/// <summary>
/// Everything copied out of one result handle, before that handle is freed.
/// </summary>
/// <remarks>
/// A snapshot rather than a wrapper, and that is the ownership rule of this
/// binding in one word: no managed object ever holds a pointer into engine
/// memory. The accessors LEND — their pointers die with the handle — so the
/// bytes are copied while the handle is alive and the handle is freed on the way
/// out, on every path.
/// </remarks>
internal sealed record Snapshot(
    int Status,
    bool Success,
    byte[] Pdf,
    string Json,
    string Diagnostics,
    string Error);

/// <summary>
/// One engine result handle, released exactly once.
/// </summary>
/// <remarks>
/// A <see cref="SafeHandle"/> because that is the finalizer-safe ownership
/// pattern: every call site disposes it with <c>using</c>, so the finalizer is a
/// back-stop rather than the release path, and a thread aborted between the call
/// and the free still frees.
/// </remarks>
internal sealed class ResultHandle : SafeHandle
{
    private readonly IntPtr free;

    internal ResultHandle(IntPtr value, IntPtr free)
        : base(IntPtr.Zero, ownsHandle: true)
    {
        SetHandle(value);
        this.free = free;
    }

    /// <summary>A blank out-slot is invalid — the header blanks it before any work starts.</summary>
    public override bool IsInvalid => handle == IntPtr.Zero;

    protected override unsafe bool ReleaseHandle()
    {
        ((delegate* unmanaged[Cdecl]<IntPtr, void>)free)(handle);
        return true;
    }
}

/// <summary>
/// The bound lifecycle, and the copy-then-free discipline around it.
/// </summary>
/// <remarks>
/// Only the lifecycle the SDK contract defines is bound: engine info, render,
/// sign, verify. <c>validate</c> and <c>preview</c> are the authoring surface's,
/// not an artifact lifecycle's — the Designer reaches them through the WASM
/// bindings, and binding them here would be surface with no contract behind it.
/// </remarks>
internal sealed unsafe class Engine
{
    private static readonly string[] BufferAccessors =
    [
        "shojiku_result_pdf",
        "shojiku_result_json",
        "shojiku_result_diagnostics_json",
        "shojiku_result_error_json",
    ];

    // Held for its LIFETIME, not for its behaviour: the entry points below point
    // into this library's open image, so letting it be collected and unloaded
    // would leave them dangling.
    private readonly Library library;

    private readonly delegate* unmanaged[Cdecl]<IntPtr*, int> info;
    private readonly delegate* unmanaged[Cdecl]<byte*, nuint, IntPtr*, int> render;
    private readonly delegate* unmanaged[Cdecl]<byte*, nuint, byte*, nuint, byte*, nuint, byte*, nuint, IntPtr*, int> sign;
    private readonly delegate* unmanaged[Cdecl]<byte*, nuint, byte*, nuint, IntPtr*, int> verify;
    private readonly delegate* unmanaged[Cdecl]<IntPtr, int*, int> success;
    private readonly IntPtr free;
    private readonly Dictionary<string, IntPtr> accessors;

    internal Engine(Library library)
    {
        this.library = library;
        info = (delegate* unmanaged[Cdecl]<IntPtr*, int>)library.Export("shojiku_engine_info");
        render = (delegate* unmanaged[Cdecl]<byte*, nuint, IntPtr*, int>)library.Export("shojiku_render");
        sign = (delegate* unmanaged[Cdecl]<byte*, nuint, byte*, nuint, byte*, nuint, byte*, nuint, IntPtr*, int>)
            library.Export("shojiku_sign");
        verify = (delegate* unmanaged[Cdecl]<byte*, nuint, byte*, nuint, IntPtr*, int>)library.Export("shojiku_verify");
        success = (delegate* unmanaged[Cdecl]<IntPtr, int*, int>)library.Export("shojiku_result_success");
        free = library.Export("shojiku_result_free");

        accessors = new Dictionary<string, IntPtr>(StringComparer.Ordinal);
        foreach (var name in BufferAccessors)
        {
            accessors[name] = library.Export(name);
        }
    }

    internal Snapshot EngineInfo()
    {
        IntPtr handle;
        var status = info(&handle);
        return Read(status, handle);
    }

    internal Snapshot Render(byte[] request)
    {
        fixed (byte* requestPtr = request)
        {
            IntPtr handle;
            var status = render(requestPtr, (nuint)request.Length, &handle);
            return Read(status, handle);
        }
    }

    internal Snapshot Sign(byte[] pdf, byte[] key, byte[] certificate, byte[]? passphrase)
    {
        // An empty array pins to a null pointer, which is exactly what the
        // header wants for an absent passphrase — and never happens for the
        // three required arguments, which are non-empty by construction.
        fixed (byte* pdfPtr = pdf)
        fixed (byte* keyPtr = key)
        fixed (byte* certPtr = certificate)
        fixed (byte* passPtr = passphrase)
        {
            IntPtr handle;
            var status = sign(
                pdfPtr,
                (nuint)pdf.Length,
                keyPtr,
                (nuint)key.Length,
                certPtr,
                (nuint)certificate.Length,
                passPtr,
                (nuint)(passphrase?.Length ?? 0),
                &handle);
            return Read(status, handle);
        }
    }

    internal Snapshot Verify(byte[] pdf, byte[] anchors)
    {
        fixed (byte* pdfPtr = pdf)
        fixed (byte* anchorsPtr = anchors)
        {
            IntPtr handle;
            var status = verify(pdfPtr, (nuint)pdf.Length, anchorsPtr, (nuint)anchors.Length, &handle);
            return Read(status, handle);
        }
    }

    /// <summary>
    /// Copy one result out, then free it.
    /// </summary>
    /// <remarks>
    /// The <c>using</c> is the ownership contract: exactly one handle crosses and
    /// exactly one free pairs with it, whatever happens in between. A blank
    /// out-slot — which is what the header leaves before any work starts — is
    /// not dereferenced at all; the status already says what happened, and
    /// freeing NULL is a documented no-op. Internal rather than private so that
    /// guard can be exercised: the library this repository builds always hands
    /// back a handle, even for a call it refuses, so the blank-slot path is
    /// unreachable through the public surface and would otherwise be defensive
    /// code nobody knows works.
    /// </remarks>
    internal Snapshot Read(int status, IntPtr value)
    {
        using var handle = new ResultHandle(value, free);
        if (handle.IsInvalid)
        {
            return new Snapshot(status, false, [], string.Empty, string.Empty, string.Empty);
        }

        return new Snapshot(
            status,
            Succeeded(value),
            Buffer(value, "shojiku_result_pdf"),
            Text(value, "shojiku_result_json"),
            Text(value, "shojiku_result_diagnostics_json"),
            Text(value, "shojiku_result_error_json"));
    }

    private bool Succeeded(IntPtr handle)
    {
        int slot;
        success(handle, &slot);
        return slot == 1;
    }

    /// <summary>
    /// Copy what an accessor lent.
    /// </summary>
    /// <remarks>
    /// A copy, which is the whole point: the pointer it copies from stops being
    /// valid the moment the handle is freed, a few lines later. The length is
    /// read FIRST, so an empty buffer never dereferences the pointer beside it.
    /// </remarks>
    private byte[] Buffer(IntPtr handle, string name)
    {
        var accessor = (delegate* unmanaged[Cdecl]<IntPtr, byte**, nuint*, int>)accessors[name];
        byte* pointer;
        nuint length;
        accessor(handle, &pointer, &length);
        if (length == 0)
        {
            return [];
        }

        var copy = new byte[(int)length];
        Marshal.Copy((IntPtr)pointer, copy, 0, copy.Length);
        return copy;
    }

    /// <summary>
    /// The same, for a buffer the surface guarantees is UTF-8.
    /// </summary>
    /// <remarks>
    /// Decoded explicitly rather than by whatever the platform would pick:
    /// Windows is a first-class target here and its default differs.
    /// </remarks>
    private string Text(IntPtr handle, string name) =>
        System.Text.Encoding.UTF8.GetString(Buffer(handle, name));
}
