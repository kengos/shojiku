/*
 * Shojiku C ABI — the shared library the FFI SDKs load.
 *
 * Artifact: libshojiku_capi.so / libshojiku_capi.dylib / shojiku_capi.dll
 *
 * THE THREE RULES THIS SURFACE IS BUILT FROM
 *
 * 1. Nothing is NUL-terminated. Every string and every buffer crosses as a
 *    pointer plus a length. PDF bytes contain NUL, so a C string would
 *    truncate a document at its first one.
 *
 * 2. One kind of allocation crosses, and it has exactly one destructor.
 *    Every operation writes a ShojikuResult* through its `out` parameter;
 *    you free it with shojiku_result_free. Pointers returned by the
 *    accessors BORROW from that handle: they are valid until you free it,
 *    and copying the bytes out is the caller's job. Nothing else this
 *    library returns is owned by you.
 *
 * 3. A failure is data, never an unwind. Every entry point that runs any
 *    code is wrapped so a panic becomes SHOJIKU_ERR_PANIC instead of
 *    unwinding into your stack. (shojiku_abi_version returns a constant and
 *    has nothing to shield.)
 *
 * TWO LEVELS OF FAILURE, AND WHY THEY ARE DIFFERENT
 *
 *    A non-zero return means YOU got it wrong (a null pointer, bytes that
 *    are not UTF-8, a request the schema rejects) or a panic was caught.
 *
 *    A zero return means the operation ran. Ask shojiku_result_success
 *    whether it worked. A template that will not lay out, a locale pack that
 *    is not installed, a key that will not sign — all of these return zero
 *    with success == 0 and diagnostics that explain it. They are outcomes,
 *    not usage errors, and an SDK should surface them as values rather than
 *    exceptions.
 *
 * Either way, if *out is non-NULL you own it and must free it. The `out`
 * slot is blanked before any work starts, so freeing it unconditionally is
 * well defined.
 *
 * WHAT THIS LIBRARY WILL NOT DO
 *
 *    It opens no sockets. Fonts and locale packs must already be installed;
 *    a missing one is a failure, never a download.
 *
 *    It reads no template off disk. Sources travel inside the request as
 *    text. It does read the font and locale pack directories the request
 *    names, plus the asset directory, and nothing else.
 *
 * WHAT IT CANNOT CHECK
 *
 *    That a length you passed matches the buffer you passed. That a handle
 *    you passed has not already been freed. Both are undefined behaviour, as
 *    they would be with any C allocator.
 *
 * THREADING
 *
 *    Every operation may be called from several threads at once. This library
 *    holds no shared mutable state: each call parses its own request, loads
 *    its own packs and returns its own handle, so concurrent calls neither
 *    interfere nor need a lock of yours. Concurrent calls also produce
 *    identical bytes for identical input — determinism is not a
 *    single-threaded property here.
 *
 *    A HANDLE is not shared. It has one owner and one free, and using one
 *    from two threads at once — or after freeing it — is undefined, as it
 *    would be with any C allocator. Give each thread its own.
 *
 *    None of the entry points block on anything but their own work, so a
 *    binding whose runtime cares (a GIL, a GVL, an event loop) can and should
 *    release it around a call.
 *
 * STABILITY
 *
 *    shojiku_abi_version() returns the revision of this file. It goes up only
 *    if a symbol's meaning or signature CHANGES. New operations and new
 *    request keys are appended without moving it, so a binding built against
 *    revision 1 keeps working against a later library.
 */

#ifndef SHOJIKU_H
#define SHOJIKU_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---- status codes ---------------------------------------------------- */

/* The operation completed. Ask the result whether it succeeded. */
#define SHOJIKU_OK 0
/* A pointer argument that must not be null was null. */
#define SHOJIKU_ERR_NULL_ARG 1
/* A string argument was not valid UTF-8. */
#define SHOJIKU_ERR_INVALID_UTF8 2
/* The request JSON was malformed, carried an unknown key, or omitted a
 * required one. shojiku_result_error_json says which. */
#define SHOJIKU_ERR_INVALID_REQUEST 3
/* An argument was larger than the cap this library accepts for it. */
#define SHOJIKU_ERR_TOO_LARGE 4
/* A page index was past the end of the document. */
#define SHOJIKU_ERR_OUT_OF_RANGE 5
/* A panic was caught at the boundary. The library is still usable; the
 * operation is not. */
#define SHOJIKU_ERR_PANIC 6

/* ---- the result handle ----------------------------------------------- */

/* Opaque. Created by the operations, destroyed by shojiku_result_free. */
typedef struct ShojikuResult ShojikuResult;

/* ---- the request envelope -------------------------------------------- */

/*
 * shojiku_validate, shojiku_render and shojiku_preview take one UTF-8 JSON
 * object. Unknown keys are REJECTED, so a misspelling is an error you can
 * see rather than a setting that quietly did nothing.
 *
 *   template            (string, required)  the template source
 *   definitions         (string)            the definitions source
 *   params              (string)            the params source; required by
 *                                           render and preview
 *   lang                (string)            locale id, beating the
 *                                           template's defaults.locale
 *   fontDirs            (string[])          extra font-pack search dirs,
 *                                           highest priority first
 *   localeDirs          (string[])          extra locale-pack search dirs
 *   assetsDir           (string)            directory bundled assets resolve
 *                                           against; without it, bundled
 *                                           sources are disabled
 *   assetMode           (string)            "open" (default) | "bundled-only"
 *   allowDynamicImage   (string[])          item ids exempt from
 *                                           bundled-only
 *   denyDynamicImage    (string[])          item ids that never take dynamic
 *                                           content
 *   scale               (number)            preview only: output pixels per
 *                                           layout point, default 2.0,
 *                                           0 < scale <= 10
 *   pageIndex           (number)            preview only: render just this
 *                                           page, 0-BASED
 *
 * scale and pageIndex are read by shojiku_preview alone; the other
 * operations accept and ignore them.
 */

/* ---- operations ------------------------------------------------------ */

/* The ABI revision this library implements. Call it first. */
uint32_t shojiku_abi_version(void);

/* Engine version, capability keys and builtin locales, as JSON. Read it with
 * shojiku_result_json. Takes no request: you can gate features before you
 * have a template. */
int32_t shojiku_engine_info(ShojikuResult **out);

/* Validates the sources. Diagnostics ride on the result either way. */
int32_t shojiku_validate(const uint8_t *request, size_t request_len,
                         ShojikuResult **out);

/* Renders to PDF. Read it with shojiku_result_pdf. */
int32_t shojiku_render(const uint8_t *request, size_t request_len,
                       ShojikuResult **out);

/* Rasterizes to PNG pages. Read them with shojiku_result_page_count and
 * shojiku_result_page_png. */
int32_t shojiku_preview(const uint8_t *request, size_t request_len,
                        ShojikuResult **out);

/*
 * Signs an already-rendered PDF. The signed bytes begin with the input byte
 * for byte — signing appends a revision, it never rewrites what was there.
 *
 * There is no request envelope: signing has no document inputs. `passphrase`
 * may be NULL, meaning the key is expected to be unencrypted; an encrypted
 * key with no passphrase comes back as a named failure. Key bytes are read
 * in place and never copied by this library.
 */
int32_t shojiku_sign(const uint8_t *pdf, size_t pdf_len,
                     const uint8_t *key, size_t key_len,
                     const uint8_t *certificate, size_t certificate_len,
                     const uint8_t *passphrase, size_t passphrase_len,
                     ShojikuResult **out);

/*
 * Verifies a signed PDF. Read the report with shojiku_result_json.
 *
 * `anchors` is REQUIRED and holds concatenated PEM certificates — one flag
 * holding a chain and several holding one certificate each are the same
 * thing. This library never consults the machine's trust store, so there is
 * nothing to default to: a verify that silently trusted whatever the
 * operating system trusts would answer a different question than you asked.
 *
 * shojiku_result_success is the VERDICT, not "a report came back". A document
 * whose signature does not verify reports success == 0 — and still carries
 * the full report, because the report names the checks this release does NOT
 * perform and a caller who never sees it cannot tell a missing capability
 * from a passed one. shojiku_result_error_json then names the first check
 * that failed.
 *
 * A document that cannot be EVALUATED at all — not a PDF, carrying no
 * signature, an undecodable container — or anchors that are not PEM, report
 * success == 0 with NO report and an error naming the cause.
 */
int32_t shojiku_verify(const uint8_t *pdf, size_t pdf_len,
                       const uint8_t *anchors, size_t anchors_len,
                       ShojikuResult **out);

/* ---- reading a result ------------------------------------------------ */

/*
 * Every accessor takes out-parameters and returns a status, so there is one
 * calling convention to learn and no value has to be reserved to mean
 * "failed". Buffer accessors LEND: the pointer is valid until
 * shojiku_result_free, and an empty buffer reports length 0.
 */

/* 1 when the operation produced what you asked for, 0 otherwise. */
int32_t shojiku_result_success(const ShojikuResult *result, int32_t *out);

/* Rendered or signed PDF bytes. */
int32_t shojiku_result_pdf(const ShojikuResult *result,
                           const uint8_t **out_ptr, size_t *out_len);

/*
 * The operation's JSON payload, as UTF-8 bytes. One meaning per operation:
 * engine info from shojiku_engine_info, {"pageCount": n} from shojiku_render,
 * and the verification report from shojiku_verify (present whichever way the
 * verdict went). Empty for the operations that have no payload.
 */
int32_t shojiku_result_json(const ShojikuResult *result,
                            const uint8_t **out_ptr, size_t *out_len);

/* The engine's diagnostics as JSON, as UTF-8 bytes. Present on success too —
 * a render that worked can still have warnings. */
int32_t shojiku_result_diagnostics_json(const ShojikuResult *result,
                                        const uint8_t **out_ptr,
                                        size_t *out_len);

/* Why it failed, as {"step":…,"kind":…,"message":…}. Empty on success.
 * `step` names the lifecycle stage, `kind` is a stable machine-readable
 * class, `message` is bounded prose. */
int32_t shojiku_result_error_json(const ShojikuResult *result,
                                  const uint8_t **out_ptr, size_t *out_len);

/* How many preview pages the result carries. */
int32_t shojiku_result_page_count(const ShojikuResult *result, size_t *out);

/* One preview page's PNG bytes, by 0-based index. Past the end returns
 * SHOJIKU_ERR_OUT_OF_RANGE. */
int32_t shojiku_result_page_png(const ShojikuResult *result, size_t index,
                                const uint8_t **out_ptr, size_t *out_len);

/* Frees a result handle and every pointer its accessors lent. NULL is a
 * no-op. Freeing the same handle twice is undefined behaviour. */
void shojiku_result_free(ShojikuResult *result);

#ifdef __cplusplus
}
#endif

#endif /* SHOJIKU_H */
