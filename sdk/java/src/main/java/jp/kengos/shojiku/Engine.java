package jp.kengos.shojiku;

import com.sun.jna.Pointer;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.ptr.PointerByReference;
import java.nio.charset.StandardCharsets;

/**
 * The one place a call crosses into the engine, and the copy-then-free discipline around it.
 *
 * <p>Only the lifecycle the SDK contract defines is bound: engine info, render, sign, verify.
 * {@code validate} and {@code preview} are the authoring surface's, not an artifact lifecycle's —
 * the Designer reaches them through the WASM bindings, and binding them here would be surface with
 * no contract behind it.
 */
final class Engine {

  private static final byte[] NOTHING = new byte[0];

  private final EngineLibrary library;
  private final ShojikuLibrary bound;

  Engine(EngineLibrary library) {
    this.library = library;
    this.bound = library.bound();
  }

  Snapshot engineInfo() {
    PointerByReference out = new PointerByReference();
    return read(bound.shojiku_engine_info(out), out);
  }

  Snapshot render(byte[] request) {
    PointerByReference out = new PointerByReference();
    int status = bound.shojiku_render(request, size(request), out);
    return read(status, out);
  }

  Snapshot sign(byte[] pdf, byte[] key, byte[] certificate, byte[] passphrase) {
    PointerByReference out = new PointerByReference();
    // A null passphrase is what the header wants for an unencrypted key; an
    // empty array would be a zero-length passphrase, which is a different claim.
    byte[] pass = passphrase == null || passphrase.length == 0 ? null : passphrase;
    int status =
        bound.shojiku_sign(
            pdf,
            size(pdf),
            key,
            size(key),
            certificate,
            size(certificate),
            pass,
            new SizeT(pass == null ? 0 : pass.length),
            out);
    return read(status, out);
  }

  Snapshot verify(byte[] pdf, byte[] anchors) {
    PointerByReference out = new PointerByReference();
    int status = bound.shojiku_verify(pdf, size(pdf), anchors, size(anchors), out);
    return read(status, out);
  }

  /**
   * Copy one result out, then free it.
   *
   * <p>The {@code finally} is the ownership contract: exactly one handle crosses and exactly one
   * free pairs with it, whatever happens in between. A blank out-slot — which is what the header
   * leaves on a rejected call — is not dereferenced at all; the status already says what happened,
   * and freeing NULL is a documented no-op.
   */
  Snapshot read(int status, PointerByReference out) {
    Pointer handle = out.getValue();
    if (handle == null) {
      return new Snapshot(status, false, NOTHING, "", "", "");
    }
    try {
      return new Snapshot(
          status,
          succeeded(handle),
          buffer(handle, Accessor.PDF),
          text(handle, Accessor.JSON),
          text(handle, Accessor.DIAGNOSTICS),
          text(handle, Accessor.ERROR));
    } finally {
      bound.shojiku_result_free(handle);
    }
  }

  private boolean succeeded(Pointer handle) {
    IntByReference slot = new IntByReference();
    bound.shojiku_result_success(handle, slot);
    return slot.getValue() == 1;
  }

  /**
   * Copy what an accessor lent.
   *
   * <p>A copy, which is the whole point: the pointer it copies from stops being valid the moment
   * the handle is freed, a few lines later. The length is read FIRST, so an empty buffer never
   * dereferences the pointer beside it.
   */
  private byte[] buffer(Pointer handle, Accessor accessor) {
    PointerByReference pointer = new PointerByReference();
    SizeTByReference length = new SizeTByReference();
    accessor.read(bound, handle, pointer, length);
    long size = length.getValue();
    if (size == 0) {
      return NOTHING;
    }
    return pointer.getValue().getByteArray(0, (int) size);
  }

  /**
   * The same, for a buffer the surface guarantees is UTF-8.
   *
   * <p>Decoded explicitly rather than by whatever the platform would pick: Windows is a first-class
   * target here and its default differs.
   */
  private String text(Pointer handle, Accessor accessor) {
    return new String(buffer(handle, accessor), StandardCharsets.UTF_8);
  }

  private static SizeT size(byte[] bytes) {
    return new SizeT(bytes.length);
  }

  /** The four buffer accessors, which all share one signature. */
  private enum Accessor {
    PDF {
      @Override
      void read(
          ShojikuLibrary bound, Pointer handle, PointerByReference out, SizeTByReference length) {
        bound.shojiku_result_pdf(handle, out, length);
      }
    },
    JSON {
      @Override
      void read(
          ShojikuLibrary bound, Pointer handle, PointerByReference out, SizeTByReference length) {
        bound.shojiku_result_json(handle, out, length);
      }
    },
    DIAGNOSTICS {
      @Override
      void read(
          ShojikuLibrary bound, Pointer handle, PointerByReference out, SizeTByReference length) {
        bound.shojiku_result_diagnostics_json(handle, out, length);
      }
    },
    ERROR {
      @Override
      void read(
          ShojikuLibrary bound, Pointer handle, PointerByReference out, SizeTByReference length) {
        bound.shojiku_result_error_json(handle, out, length);
      }
    };

    abstract void read(
        ShojikuLibrary bound, Pointer handle, PointerByReference out, SizeTByReference length);
  }
}
