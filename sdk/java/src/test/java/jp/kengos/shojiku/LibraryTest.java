package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.jna.Native;
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Finding and opening the engine library, and the resolution order that is the deliberate reverse
 * of the template root's.
 */
class LibraryTest extends Fixtures {

  @Test
  void theEnvironmentBeatsExplicitConfigurationForTheLibrary() {
    // The reverse of the template root, on purpose: WHERE THE ENGINE LIVES is an
    // operator/deployment decision that has to be able to win over application
    // code — the same order the subprocess SDKs give SHOJIKU_BIN.
    Env env = new Env(true, Map.of("SHOJIKU_LIBRARY", LIBRARY));

    EngineLibrary library = new EngineLibrary("/nowhere/libshojiku_capi.so", env, new Log());

    assertEquals(LIBRARY, library.path());
    assertEquals("environment", library.source());
  }

  @Test
  void explicitConfigurationWinsWhenTheEnvironmentIsSilent() {
    EngineLibrary library = new EngineLibrary(LIBRARY, new Env(false), new Log());

    assertEquals(LIBRARY, library.path());
    assertEquals("configuration", library.source());
  }

  @Test
  void whichPositionWonIsReportedBecauseThatIsThe3amQuestion() {
    List<String> lines = new ArrayList<>();

    new EngineLibrary(LIBRARY, new Env(false), new Log(lines::add));

    assertTrue(
        lines.stream()
            .anyMatch(
                line -> line.contains("library_loaded") && line.contains("source=configuration")));
  }

  @Test
  void aLibraryThatIsNotThereNamesTheInstallChannels() {
    // The fix is always an installation step, and a bare loader error names none
    // of them.
    LibraryNotFoundException error =
        assertThrows(
            LibraryNotFoundException.class,
            () -> new EngineLibrary(null, new Env(false), new Log()));

    assertTrue(error.getMessage().contains("never downloads"));
    assertTrue(error.getMessage().contains("SHOJIKU_LIBRARY"));
  }

  @Test
  void aLibraryThatWillNotLoadNamesThemToo() throws IOException {
    Path notALibrary = Files.createTempFile("shojiku-not-a-lib", ".so");
    try {
      Files.writeString(notALibrary, "this is not an ELF object");

      LibraryNotFoundException error =
          assertThrows(
              LibraryNotFoundException.class,
              () -> new EngineLibrary(notALibrary.toString(), new Env(false), new Log()));

      assertTrue(error.getMessage().contains("could not be loaded"));
      assertTrue(error.getMessage().contains("never downloads"));
    } finally {
      Files.deleteIfExists(notALibrary);
    }
  }

  @ParameterizedTest
  // Windows is the reason there are six rather than three: cargo emits
  // `shojiku_capi.dll` with NO `lib` prefix while the Unix targets get one.
  // Looking only for the prefixed form would make the package unloadable on half
  // this SDK's market — one test per name, so a dropped candidate cannot hide
  // behind the others.
  @ValueSource(
      strings = {
        "libshojiku_capi.so",
        "shojiku_capi.so",
        "libshojiku_capi.dylib",
        "shojiku_capi.dylib",
        "libshojiku_capi.dll",
        "shojiku_capi.dll"
      })
  void everyPlatformsLibraryFilenameIsAmongTheCandidates(String name) {
    assertTrue(EngineLibrary.NAMES.contains(name));
  }

  @Test
  void theCandidateListHasNothingElseInIt() {
    // A negative sweep beside the positive one: a stray candidate would mean the
    // lookup probes for a filename no platform produces.
    assertEquals(6, EngineLibrary.NAMES.size());
  }

  @Test
  void thereIsNoPackagedBinaryInASourceCheckout() {
    // A test classpath is not a platform classifier jar, so there is nothing to
    // find — which is exactly the "no engine library was found" path.
    assertNull(EngineLibrary.packagedFrom(getClass().getClassLoader()));
  }

  @Test
  void aPackagedBinaryIsFoundOnTheClasspathWhenThereIsOne() throws IOException {
    // An UNPACKED classpath entry: the binary is already a file, so the lookup must
    // hand back that file rather than a copy of it.
    Path native0 = classpathRoot().resolve(EngineLibrary.PACKAGED_DIRNAME);
    Files.createDirectories(native0);
    Path planted = native0.resolve("libshojiku_capi.so");
    Files.copy(Path.of(LIBRARY), planted, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    try {
      assertEquals(planted.toString(), EngineLibrary.packagedFrom(getClass().getClassLoader()));

      EngineLibrary library = new EngineLibrary(null, new Env(false), new Log());

      assertEquals(planted.toString(), library.path());
      assertEquals("packaged", library.source());
    } finally {
      Files.deleteIfExists(planted);
      Files.deleteIfExists(native0);
    }
  }

  @Test
  void theBinaryInsideARealPlatformJarIsExtractedAndLoadable() throws IOException {
    // The shape that actually SHIPS, and the one this suite used to miss: inside a
    // jar the binary is an archive entry, not a file, and `native/` names no
    // filesystem path at all. A lookup that resolved the directory passed every
    // test above and could not load one published artifact.
    Path jar = jarContaining("native/libshojiku_capi.so", Path.of(LIBRARY));
    try (URLClassLoader loader = new URLClassLoader(new URL[] {jar.toUri().toURL()}, null)) {
      String found = EngineLibrary.packagedFrom(loader);

      assertNotNull(found);
      // Extracted OUT of the archive: a path inside the jar would name nothing the
      // dynamic linker can open.
      assertFalse(found.contains(".jar!"));
      assertTrue(Files.isRegularFile(Path.of(found)));
      assertEquals(Files.size(Path.of(LIBRARY)), Files.size(Path.of(found)));

      // Whole bytes are not the claim that matters — loadability is. This is the
      // assertion the directory-shaped test could never make.
      assertEquals(
          EngineLibrary.ABI_VERSION,
          Native.load(found, ShojikuLibrary.class).shojiku_abi_version());
    } finally {
      Files.deleteIfExists(jar);
    }
  }

  @Test
  void aJarCarryingNoKnownBinaryNameResolvesToNothing() throws IOException {
    // A `native/` entry is where a platform jar PUTS the binary, not proof that one
    // is there. This is also what walks the whole candidate list to its end.
    Path jar = jarContaining("native/README.txt", null);
    try (URLClassLoader loader = new URLClassLoader(new URL[] {jar.toUri().toURL()}, null)) {
      assertNull(EngineLibrary.packagedFrom(loader));
    } finally {
      Files.deleteIfExists(jar);
    }
  }

  @Test
  void aPackagedDirectoryWithNoBinaryInItResolvesToNothing() throws IOException {
    // The unpacked twin of the case above: an empty `native/` must fall through to
    // the install hint, not to a path that opens nothing.
    Path native0 = classpathRoot().resolve(EngineLibrary.PACKAGED_DIRNAME);
    Files.createDirectories(native0);
    try {
      assertNull(EngineLibrary.packagedFrom(getClass().getClassLoader()));
      assertThrows(
          LibraryNotFoundException.class, () -> new EngineLibrary(null, new Env(false), new Log()));
    } finally {
      Files.deleteIfExists(native0);
    }
  }

  @Test
  void aLibrarySpeakingADifferentRevisionIsRefused() {
    // Loading anyway would mean calling symbols whose meaning has changed. The
    // rule is checked as a rule: a library that reports another revision cannot be
    // produced from the one this repository builds, and a refusal nobody can
    // exercise is a refusal nobody knows works.
    EngineLibrary.requireAbi(EngineLibrary.ABI_VERSION, "/lib.so");

    AbiMismatchException error =
        assertThrows(
            AbiMismatchException.class,
            () -> EngineLibrary.requireAbi(EngineLibrary.ABI_VERSION + 1, "/lib.so"));

    assertTrue(
        error.getMessage().contains("implements ABI revision " + (EngineLibrary.ABI_VERSION + 1)));
    assertTrue(error.getMessage().contains("speaks " + EngineLibrary.ABI_VERSION));
  }

  /**
   * A throwaway jar carrying one entry, which is the only way to test the shape that ships.
   *
   * @param entry the path inside the archive
   * @param content the file to store there, or null for an empty entry
   * @return the jar's path
   */
  private static Path jarContaining(String entry, Path content) throws IOException {
    Path jar = Files.createTempFile("shojiku-platform", ".jar");
    try (JarOutputStream out = new JarOutputStream(Files.newOutputStream(jar))) {
      out.putNextEntry(new JarEntry(entry));
      if (content != null) {
        Files.copy(content, out);
      }
      out.closeEntry();
    }
    return jar;
  }

  private static Path classpathRoot() {
    try {
      return Path.of(LibraryTest.class.getProtectionDomain().getCodeSource().getLocation().toURI());
    } catch (java.net.URISyntaxException error) {
      throw new IllegalStateException(error);
    }
  }

  @Test
  void theAbiRevisionIsCheckedBeforeAnythingElseIsCalled() {
    // Asked once: the only way a binding learns that a symbol it is about to call
    // means something different now.
    List<String> lines = new ArrayList<>();

    new EngineLibrary(LIBRARY, new Env(false), new Log(lines::add));

    assertEquals(1, EngineLibrary.ABI_VERSION);
    assertTrue(
        lines.stream()
            .anyMatch(line -> line.contains("abi_checked found=" + EngineLibrary.ABI_VERSION)));
  }
}
