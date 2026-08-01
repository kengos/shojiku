package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The template-root hardening, one test per claim.
 *
 * <p>A hostile NAME is a fact about the request, so every case here is a FAILED RESULT rather than
 * an exception — the distinction a caller branches on. The rules are the UNION across platforms, so
 * a name refused on Linux is refused on Windows and the same application deploys to both.
 */
class TemplateRootTest extends Fixtures {

  @ParameterizedTest
  @ValueSource(
      strings = {
        // Blank: a hostile STRING, not misuse — it can arrive straight from a form field.
        "",
        "   ",
        // Traversal, in both separators, and what subsumes it: a name is one segment.
        "../receipt",
        "..\\receipt",
        "nested/receipt",
        "nested\\receipt",
        // Absolute, POSIX and Windows.
        "/etc/passwd",
        "\\\\host\\share",
        // Drive-relative: Windows resolves this against that drive's current directory.
        "C:receipt",
        // Control characters, including the NUL a C boundary must never be handed.
        "recei\0pt",
        "recei\npt",
        "recei\u001bpt",
        // Reserved DOS devices, including the trailing dots and spaces Windows strips first.
        "CON",
        "nul",
        "CON.",
        "CON ",
        "LPT1",
        "COM9.txt"
      })
  void aHostileNameIsARefusedRequest(String name) {
    Result<DocumentArtifact> result = client().build().generate(name, null);

    assertTrue(result.failed(), name);
    assertEquals("template_name", result.failure().kind());
    assertEquals(Step.GENERATE, result.failure().step());
  }

  @Test
  void aNullNameIsARefusedRequestToo() {
    // It can arrive from a deserialized payload with a missing field, which is
    // the same class of thing as a blank one: a fact about the request.
    Result<DocumentArtifact> result = client().build().generate(null, null);

    assertTrue(result.failed());
    assertEquals("template_name", result.failure().kind());
  }

  @Test
  void aRefusalCapsHowMuchOfTheNameItEchoes() {
    // A name reaches exception reporters and log files, so the echo is bounded —
    // the same discipline the engine applies to what it echoes.
    String hostile = "C:" + "x".repeat(500);

    Result<DocumentArtifact> result = client().build().generate(hostile, null);

    assertTrue(result.failed());
    assertFalse(result.failure().message().contains("x".repeat(200)));
  }

  @Test
  void aRefusalStripsControlCharactersOutOfTheEcho() {
    // A separate surface from the cap: a hostile name must not be able to smuggle
    // an escape sequence into a terminal or a log aggregator.
    Result<DocumentArtifact> result = client().build().generate("recei\u001bpt", null);

    assertTrue(result.failed());
    assertFalse(result.failure().message().contains("\u001b"));
  }

  @Test
  void aNameThatIsNotThereIsARefusedRequestNamingWhy() {
    Result<DocumentArtifact> result = client().build().generate("no_such_template", null);

    assertTrue(result.failed());
    assertEquals("template_not_found", result.failure().kind());
    // The underlying io error rides as the CAUSE, not as the headline.
    assertNotNull(result.failure().cause());
    assertEquals("io", result.failure().cause().kind());
    assertEquals(2, result.failure().causes().size());
  }

  @Test
  void aSymlinkPointingOutsideTheRootIsNotFollowed() throws IOException {
    // The check a name-shape rule cannot make: this name passes every rule above
    // and still points out.
    Path outside = Files.createTempDirectory("shojiku-outside");
    Path root = Files.createTempDirectory("shojiku-root");
    try {
      Files.copy(
          Paths.get(TEMPLATES, "receipt", "templates.yml"), outside.resolve("templates.yml"));
      Files.createSymbolicLink(root.resolve("escape"), outside);

      Result<DocumentArtifact> result =
          client().templates(root.toString()).build().generate("escape", null);

      assertTrue(result.failed());
      assertEquals("template_escapes_root", result.failure().kind());
    } finally {
      delete(root);
      delete(outside);
    }
  }

  @Test
  void aSymlinkStayingInsideTheRootIsFine() throws IOException {
    // Containment is about where the answer LANDS, not about symlinks.
    Path root = Files.createTempDirectory("shojiku-root");
    try {
      Path real = Files.createDirectory(root.resolve("real"));
      Files.copy(Paths.get(TEMPLATES, "receipt", "templates.yml"), real.resolve("templates.yml"));
      Files.createSymbolicLink(root.resolve("alias"), real);

      assertTrue(client().templates(root.toString()).build().generate("alias", null).success());
    } finally {
      delete(root);
    }
  }

  @Test
  void aSiblingDirectoryWithTheRootsNameAsAPrefixIsNotInsideIt() throws IOException {
    // What a string prefix compare gets wrong: `/tmp/root-evil` starts with
    // `/tmp/root`. The containment test is structural instead.
    Path parent = Files.createTempDirectory("shojiku-prefix");
    try {
      Path root = Files.createDirectory(parent.resolve("root"));
      Path evil = Files.createDirectories(parent.resolve("root-evil").resolve("receipt"));
      Files.copy(Paths.get(TEMPLATES, "receipt", "templates.yml"), evil.resolve("templates.yml"));
      Files.createSymbolicLink(root.resolve("receipt"), evil);

      Result<DocumentArtifact> result =
          client().templates(root.toString()).build().generate("receipt", null);

      assertTrue(result.failed());
      assertEquals("template_escapes_root", result.failure().kind());
    } finally {
      delete(parent);
    }
  }

  @Test
  void anUnreadableTemplateIsARefusedRequest() throws IOException {
    // Structurally unreadable, not `chmod 000`: the gate container runs as root,
    // which ignores permission bits — that test would pass for the wrong reason.
    // A directory where the file belongs cannot be read by anyone.
    Path root = Files.createTempDirectory("shojiku-unreadable");
    try {
      Files.createDirectories(root.resolve("shadow").resolve("templates.yml"));

      Result<DocumentArtifact> result =
          client().templates(root.toString()).build().generate("shadow", null);

      assertTrue(result.failed());
      assertEquals("template_unreadable", result.failure().kind());
      assertEquals("io", result.failure().cause().kind());
    } finally {
      delete(root);
    }
  }

  @Test
  void definitionsAreOptional() {
    // `warns` has no definitions.yml; `receipt` has one. Both resolve.
    assertTrue(client().build().generate("warns", null).success());
    assertTrue(client().build().generate("receipt", null).success());
  }

  @Test
  void theEnvironmentSuppliesTheRoot() {
    // Through the rule itself, with the environment injected: a Java process
    // cannot set a variable in its own environment, so a test that went through a
    // built client could only ever prove the explicit half of the precedence.
    Env env = new Env(true, Map.of("SHOJIKU_TEMPLATE_ROOT", TEMPLATES));

    assertEquals(TEMPLATES, Settings.resolveRoot(null, env));
  }

  @Test
  void explicitConfigurationBeatsTheEnvironment() {
    // The deliberate asymmetry with the LIBRARY: what an application renders is
    // the application's own decision, so the explicit value wins here — while
    // SHOJIKU_LIBRARY beats an explicit library path, which LibraryTest proves
    // end to end against the variable the gate image really sets.
    Env env = new Env(true, Map.of("SHOJIKU_TEMPLATE_ROOT", TEMPLATES));

    assertEquals("/explicit", Settings.resolveRoot("/explicit", env));
  }

  @Test
  void theEnvironmentKnobDisablesTheLookup() {
    Env silenced = new Env(false, Map.of("SHOJIKU_TEMPLATE_ROOT", TEMPLATES));

    assertNull(Settings.resolveRoot(null, silenced));
    // And end to end: a client built with env(false) and no explicit root has none.
    assertNull(rootless().build().templateRootOrNull());
  }

  @Test
  void nothingSuppliesARootWhenNeitherPositionDoes() {
    assertNull(Settings.resolveRoot(null, new Env(true, Map.of())));
  }

  private static void delete(Path directory) throws IOException {
    try (Stream<Path> walk = Files.walk(directory)) {
      walk.sorted(Comparator.reverseOrder()).map(Path::toFile).forEach(java.io.File::delete);
    }
  }
}
