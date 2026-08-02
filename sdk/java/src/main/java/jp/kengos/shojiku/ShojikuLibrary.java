package jp.kengos.shojiku;

import com.sun.jna.Library;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.ptr.PointerByReference;

/**
 * The declared C surface.
 *
 * <p>Interface mapping rather than {@code Native.register} direct mapping: this binding's
 * resolution order is per CLIENT — {@code SHOJIKU_LIBRARY} beats explicit configuration beats the
 * copy inside the platform jar — and direct mapping binds a library to a class at
 * class-initialization time, once per process. A test suite that builds clients over different
 * libraries needs the per-instance form.
 *
 * <p>The {@link SizeT} and {@link SizeTByReference} types are public for one reason: JNA
 * instantiates argument and return types reflectively from its own package. They are transport
 * plumbing, not lifecycle surface.
 *
 * <p>Every signature is written from {@code engine/capi/include/shojiku.h}, widths included.
 * Nothing data-bearing crosses as {@code String}: JNA's {@code String} marshalling uses the
 * PLATFORM charset, which is not UTF-8 on Windows, and PDF bytes contain NUL so nothing is
 * NUL-terminated either. Buffers cross as {@code byte[]} with an explicit length, and text is
 * decoded with an explicit charset on the way out.
 */
interface ShojikuLibrary extends Library {

  /** The ABI revision this library implements. Called first, before anything else. */
  int shojiku_abi_version();

  /** Engine version, capability keys and builtin locales, as JSON. */
  int shojiku_engine_info(PointerByReference out);

  /** Renders to PDF. */
  int shojiku_render(byte[] request, SizeT requestLen, PointerByReference out);

  /** Signs an already-rendered PDF; the passphrase may be null. */
  int shojiku_sign(
      byte[] pdf,
      SizeT pdfLen,
      byte[] key,
      SizeT keyLen,
      byte[] certificate,
      SizeT certificateLen,
      byte[] passphrase,
      SizeT passphraseLen,
      PointerByReference out);

  /** Verifies a signed PDF against concatenated PEM anchors. */
  int shojiku_verify(
      byte[] pdf, SizeT pdfLen, byte[] anchors, SizeT anchorsLen, PointerByReference out);

  /** 1 when the operation produced what you asked for, 0 otherwise. */
  int shojiku_result_success(Pointer result, IntByReference out);

  /** Rendered or signed PDF bytes. */
  int shojiku_result_pdf(Pointer result, PointerByReference outPtr, SizeTByReference outLen);

  /** The operation's JSON payload, as UTF-8 bytes. */
  int shojiku_result_json(Pointer result, PointerByReference outPtr, SizeTByReference outLen);

  /** The engine's diagnostics as JSON. Present on success too. */
  int shojiku_result_diagnostics_json(
      Pointer result, PointerByReference outPtr, SizeTByReference outLen);

  /** Why it failed. Empty on success. */
  int shojiku_result_error_json(Pointer result, PointerByReference outPtr, SizeTByReference outLen);

  /** Frees a result handle and every pointer its accessors lent. NULL is a no-op. */
  void shojiku_result_free(Pointer result);
}
