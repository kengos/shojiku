package jp.kengos.shojiku;

import com.sun.jna.Native;
import java.io.File;
import java.io.IOException;
import java.util.List;

/**
 * Finding and opening the engine's shared library.
 *
 * <p>Resolution order, and the deliberate asymmetry with the template root: {@code SHOJIKU_LIBRARY}
 * beats explicit configuration, which beats the copy shipped inside the platform jar. That is the
 * reverse of how the template root resolves, and on purpose — WHERE THE ENGINE LIVES is an
 * operator/deployment decision that has to be able to win over application code, exactly as {@code
 * SHOJIKU_BIN} does for the subprocess SDKs. WHICH TEMPLATES an application renders is the
 * application's own decision, so there the explicit value wins.
 *
 * <p>Nothing here downloads anything. A library that is not present is a named error listing the
 * install channels.
 */
final class EngineLibrary {

  /**
   * The ABI revision this package is written against.
   *
   * <p>It moves only when a symbol's meaning changes; new operations are appended without it, so a
   * newer engine keeps working with this package.
   */
  static final int ABI_VERSION = 1;

  /** Where a platform jar puts the binary it ships. */
  static final String PACKAGED_DIRNAME = "native";

  /**
   * The names a platform jar's binary can have, in the order they are tried.
   *
   * <p>Six rather than three, and Windows is the reason: cargo emits {@code shojiku_capi.dll} with
   * NO {@code lib} prefix while the Unix targets get one. Looking only for the prefixed form would
   * make the package unloadable on the platform half this SDK's market runs.
   */
  static final List<String> NAMES =
      List.of(
          "libshojiku_capi.so",
          "shojiku_capi.so",
          "libshojiku_capi.dylib",
          "shojiku_capi.dylib",
          "libshojiku_capi.dll",
          "shojiku_capi.dll");

  private final String path;
  private final String source;
  private final ShojikuLibrary bound;

  EngineLibrary(String configured, Env env, Log log) {
    String fromEnv = env.get("SHOJIKU_LIBRARY");
    if (fromEnv != null) {
      this.path = fromEnv;
      this.source = "environment";
    } else if (configured != null) {
      this.path = configured;
      this.source = "configuration";
    } else {
      this.path = packaged();
      this.source = "packaged";
    }

    if (path == null) {
      throw new LibraryNotFoundException(installHint("no engine library was found"));
    }

    this.bound = open(path);
    log.event("library_loaded", "path", path, "source", source);
    checkAbi(log);
  }

  /**
   * Which file was opened.
   *
   * @return the path
   */
  String path() {
    return path;
  }

  /**
   * Which position in the resolution order won.
   *
   * <p>Worth reporting, because "which library did this process actually load, and why that one" is
   * the question a deployment asks at 3am.
   *
   * @return the position's name
   */
  String source() {
    return source;
  }

  ShojikuLibrary bound() {
    return bound;
  }

  /**
   * The binary this package ships, as a file on disk.
   *
   * <p>The candidates are probed as RESOURCES rather than by resolving {@link #PACKAGED_DIRNAME} to
   * a directory and listing it, because in the shape that actually ships the directory is not one:
   * a classifier jar's {@code native/} entry is reachable only through a {@code jar:} URL, which
   * names no filesystem path. JNA's extraction is what closes that gap — it hands back the file
   * itself when the resource is already unpacked (a source checkout) and a copy in its own managed
   * temporary directory when it is inside the jar.
   *
   * <p>Separated from {@link #packaged()} so a test can hand it a loader over a REAL jar. The
   * distinction is the entire point: a lookup that only ever saw an exploded classpath passed its
   * tests and could not load a single published artifact.
   *
   * @param loader where to look
   * @return the path of the library file, or null when this loader carries none
   */
  static String packagedFrom(ClassLoader loader) {
    for (String name : NAMES) {
      try {
        return Native.extractFromResourcePath("/" + PACKAGED_DIRNAME + "/" + name, loader)
            .getAbsolutePath();
      } catch (IOException absent) {
        // Not the filename this platform's jar carries; try the next candidate.
      }
    }
    return null;
  }

  private static String packaged() {
    return packagedFrom(EngineLibrary.class.getClassLoader());
  }

  private static ShojikuLibrary open(String path) {
    try {
      // The absolute path, not a stem: the resolution order above already
      // decided WHICH file, and letting JNA search again could load a different
      // one.
      return Native.load(new File(path).getAbsolutePath(), ShojikuLibrary.class);
    } catch (UnsatisfiedLinkError | RuntimeException error) {
      throw new LibraryNotFoundException(
          installHint(path + " could not be loaded (" + error.getMessage() + ")"), error);
    }
  }

  /**
   * Asked once, before anything else is called.
   *
   * <p>The header's own advice, and the only way a binding learns that a symbol it is about to call
   * means something different now.
   */
  private void checkAbi(Log log) {
    int found = bound.shojiku_abi_version();
    log.event("abi_checked", "found", found, "expected", ABI_VERSION);
    requireAbi(found, path);
  }

  /** The rule the check applies, separated from the call that feeds it. */
  static void requireAbi(int found, String path) {
    if (found == ABI_VERSION) {
      return;
    }
    throw new AbiMismatchException(
        path + " implements ABI revision " + found + "; this package speaks " + ABI_VERSION);
  }

  private static String installHint(String reason) {
    return reason
        + ".\n\n"
        + "This package never downloads the engine. Install it one of these ways:\n"
        + "  * add the platform classifier jar for your system, which ships the binary\n"
        + "  * point SHOJIKU_LIBRARY at a shojiku_capi library you built\n"
        + "  * ShojikuClient.builder().library(\"/path/to/libshojiku_capi.so\")";
  }
}
