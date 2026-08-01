package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Nothing here downloads anything, at install time or at run time.
 *
 * <p>An SDK that fetches an executable is a supply-chain surface this product's trust story cannot
 * afford, so the claim is asserted rather than left to reviewers.
 */
class NoDownloadTest extends Fixtures {

  @Test
  void thePackageDeclaresExactlyOneRuntimeDependency() {
    // JNA is the transport, and nothing else is pulled into an application's
    // classpath — which is also why the JSON on the wire is parsed by a small
    // reader in this package rather than by Jackson. A package with one
    // well-known dependency has no dependency that could fetch something.
    List<String> runtime = runtimeDependencies();

    assertEquals(List.of("net.java.dev.jna:jna"), runtime);
  }

  @Test
  void nothingInThePackageOpensASocketOrRunsAProcess() {
    // A structural claim, checked structurally: no source file here mentions the
    // networking or process-launching surfaces at all.
    List<String> forbidden =
        List.of("java.net.URLConnection", "java.net.Socket", "ProcessBuilder", "HttpClient");

    for (String source : sourceFiles()) {
      for (String name : forbidden) {
        assertTrue(!source.contains(name), name + " is a surface this package must not have");
      }
    }
  }

  @Test
  void aMissingLibraryTellsTheReaderHowToInstallOneRatherThanFetchingIt() {
    LibraryNotFoundException error =
        assertThrows(
            LibraryNotFoundException.class,
            () -> new EngineLibrary(null, new Env(false), new Log()));

    assertTrue(error.getMessage().contains("never downloads"));
    // Every channel it names is an installation the operator performs.
    assertTrue(error.getMessage().contains("classifier jar"));
    assertTrue(error.getMessage().contains("SHOJIKU_LIBRARY"));
    assertTrue(error.getMessage().contains("ShojikuClient.builder()"));
  }

  @Test
  void theTextEntranceDoesNotFetchEitherItTakesWhatYouAlreadyHold() {
    // Fetching stays the application's act — which is why the entrance takes
    // source TEXT and a path-shaped value is a template that fails to parse.
    assertTrue(client().build().generateSource("https://example.com/templates.yml").failed());
  }

  private static List<String> runtimeDependencies() {
    // Read from the POM rather than from the classpath, which in a test run also
    // carries JUnit and its transitive tree.
    String pom = read(Path.of("pom.xml"));
    java.util.regex.Matcher matcher =
        java.util.regex.Pattern.compile(
                "<dependency>\\s*<groupId>([^<]+)</groupId>\\s*<artifactId>([^<]+)</artifactId>"
                    + "(?:(?!</dependency>).)*?</dependency>",
                java.util.regex.Pattern.DOTALL)
            .matcher(pom);
    List<String> runtime = new java.util.ArrayList<>();
    while (matcher.find()) {
      if (!matcher.group().contains("<scope>test</scope>")) {
        runtime.add(matcher.group(1) + ":" + matcher.group(2));
      }
    }
    return runtime;
  }

  private static List<String> sourceFiles() {
    Path main = Path.of("src", "main", "java");
    try (Stream<Path> walk = Files.walk(main)) {
      return walk.filter(path -> path.toString().endsWith(".java"))
          .map(NoDownloadTest::read)
          .toList();
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }

  private static String read(Path path) {
    try {
      return Files.readString(path);
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }
}
