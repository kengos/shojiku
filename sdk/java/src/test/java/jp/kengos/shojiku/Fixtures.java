package jp.kengos.shojiku;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;

/**
 * Fixtures shared by every test: the real engine library, the repository's own font and locale
 * packs, and generated key material.
 *
 * <p>Nothing here is a stub. This SDK's whole job is to be a faithful binding, so a suite that
 * mocked the boundary would test the mock. What it does avoid is repeating the setup: the key
 * generator runs once for the whole JVM, which surefire keeps to one fork for exactly this reason.
 */
abstract class Fixtures {

  /** The engine library the gate image injected. */
  static final String LIBRARY = requireLibrary();

  /** The repository this suite runs inside, found by walking up for the workspace markers. */
  static final Path REPO = findRepo();

  /** Where the fixture templates live, on the test classpath. */
  static final String TEMPLATES = resource("fixtures/templates");

  /**
   * Where the text entrance's bundled assets live.
   *
   * <p>A directory rather than a template root: {@code generateSource} resolves {@code
   * assets/logo.svg} against it and resolves NOTHING else, since there is no name to look up.
   */
  static final String SOURCE_ASSETS = resource("fixtures/sources");

  /**
   * Generated, never committed.
   *
   * <p>A repository checkout holds no private key and a leaked test key is worth nothing. The same
   * generator the Rust suites use, so both sides sign with the same shapes. Run ONCE — a generator
   * that is merely idempotent is still unsafe to run beside itself, because it writes its
   * completion sentinel last.
   */
  static final Path KEYS = generateKeys();

  /**
   * {@link Configuration} is process-wide state.
   *
   * <p>A test that sets a default would otherwise decide what an unrelated one resolves to — the
   * failure appearing in whichever test happened to run next.
   */
  @AfterEach
  void resetConfiguration() {
    Configuration.reset();
  }

  /** A client over the fixture template root, with the packs wired up. */
  static ShojikuClient.Builder client() {
    return ShojikuClient.builder()
        .templates(TEMPLATES)
        .fontDirs(List.of(REPO.resolve("packs/fonts").toString()))
        .localeDirs(List.of(REPO.resolve("packs/locale").toString()))
        .library(LIBRARY)
        // Deliberately OFF: a test that accidentally inherited a SHOJIKU_*
        // variable from the runner would be testing the runner.
        .env(false);
  }

  /** A client with no template root, for the text entrance. */
  static ShojikuClient.Builder rootless() {
    return ShojikuClient.builder()
        .fontDirs(List.of(REPO.resolve("packs/fonts").toString()))
        .localeDirs(List.of(REPO.resolve("packs/locale").toString()))
        .library(LIBRARY)
        .env(false);
  }

  /** A generated key or certificate, by file name. */
  static Path key(String name) {
    return KEYS.resolve(name);
  }

  /** A signer over the generated RSA key pair. */
  static LocalPem signer() {
    return new LocalPem(key("rsa2048.key.pem"), key("rsa2048.cert.pem"));
  }

  /** A rendered document from the fixture receipt template. */
  static DocumentArtifact rendered(ShojikuClient client) {
    Result<DocumentArtifact> result =
        client.generate("receipt", Map.of("customer", Map.of("name", "Yamada Shoji K.K.")));
    if (result.failed()) {
      throw new IllegalStateException("the fixture template did not render: " + result.failure());
    }
    return result.unwrap();
  }

  /** A signed document over {@link #rendered}. */
  static DocumentArtifact signed(ShojikuClient client) {
    Result<DocumentArtifact> result = client.sign(rendered(client), signer());
    if (result.failed()) {
      throw new IllegalStateException("the fixture document did not sign: " + result.failure());
    }
    return result.unwrap();
  }

  /** The fixture receipt template, as SOURCE TEXT for the entrance that never reads a file. */
  static String receiptSource() {
    try {
      return Files.readString(Paths.get(TEMPLATES, "receipt", "templates.yml"));
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }

  private static String requireLibrary() {
    String path = System.getenv("SHOJIKU_LIBRARY");
    if (path == null || path.isEmpty()) {
      throw new IllegalStateException("SHOJIKU_LIBRARY is not set; the gate image sets it");
    }
    return path;
  }

  private static String resource(String name) {
    java.net.URL url = Fixtures.class.getClassLoader().getResource(name);
    if (url == null) {
      throw new IllegalStateException(name + " is not on the test classpath");
    }
    try {
      return Paths.get(url.toURI()).toString();
    } catch (java.net.URISyntaxException error) {
      throw new IllegalStateException(error);
    }
  }

  private static Path findRepo() {
    Path directory = Paths.get("").toAbsolutePath();
    while (directory != null) {
      if (Files.isRegularFile(directory.resolve("Makefile"))
          && Files.isDirectory(directory.resolve("engine"))) {
        return directory;
      }
      directory = directory.getParent();
    }
    throw new IllegalStateException("the repository root is not above the working directory");
  }

  private static Path generateKeys() {
    try {
      Path directory = Files.createTempDirectory("shojiku-keys");
      Process process =
          new ProcessBuilder(
                  "sh", REPO.resolve("scripts/gen-test-keys.sh").toString(), directory.toString())
              .redirectErrorStream(true)
              .start();
      String output = new String(process.getInputStream().readAllBytes());
      if (process.waitFor() != 0) {
        throw new IllegalStateException("gen-test-keys.sh failed: " + output);
      }
      return directory;
    } catch (IOException error) {
      throw new IllegalStateException(error);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(error);
    }
  }
}
