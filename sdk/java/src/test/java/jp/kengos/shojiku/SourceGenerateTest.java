package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/** The text-first entrance, and the one thing it must never do. */
class SourceGenerateTest extends Fixtures {

  private static String sourceTemplate(String items) {
    String indented =
        Stream.of(items.stripTrailing().split("\n"))
            .map(line -> "      " + line)
            .collect(Collectors.joining("\n"));
    return "version: 0.1.0\n"
        + "name: inline\n"
        + "page: { size: A4, margin: 25 }\n"
        + "defaults:\n"
        + "  locale: en-US\n"
        + "  style: { fontFamily: noto-sans, fontSize: 10.5 }\n"
        + "sections:\n"
        + "  body:\n"
        + "    type: flow\n"
        + "    items:\n"
        + indented
        + "\n";
  }

  private static String textItem(String key) {
    return "- id: line\n"
        + "  type: text\n"
        + "  box: { x: 0, y: 0, w: 400, h: 16 }\n"
        + "  text: \"Billed to {"
        + key
        + "}\"\n";
  }

  private static String imageItem() {
    return "- id: logo\n"
        + "  type: image\n"
        + "  box: { x: 0, y: 0, w: 40, h: 40 }\n"
        + "  src: assets/logo.svg\n";
  }

  @Test
  void sourcesTheApplicationHoldsRenderWithoutATemplateRoot() {
    // For templates that do not live in a directory this package can see: object
    // storage, a database, a heredoc. Fetching stays the application's act —
    // nothing here opens a socket.
    Result<DocumentArtifact> result =
        rootless()
            .build()
            .generateSource(
                sourceTemplate(textItem("customer.name")),
                null,
                null,
                Map.of("customer", Map.of("name", "Yamada Shoji K.K.")),
                null);

    assertTrue(result.success());
    assertEquals(Origin.SOURCE, result.artifact().origin());
    assertEquals(1, result.artifact().pageCount());
  }

  @Test
  void aPathShapedTemplateArgumentIsAParseFailureNotAFileThatWasOpened() {
    // The rule the entrance exists under: its template argument is source TEXT. An
    // SDK that helpfully opened a path-shaped value would make every containment
    // rule bypassable by spelling the same thing differently.
    Path real = Paths.get(TEMPLATES, "receipt", "templates.yml");
    assertTrue(Files.exists(real), "the fixture this test disproves must exist");

    Result<DocumentArtifact> result = client().build().generateSource(real.toString());

    assertTrue(result.failed());
    assertEquals(Step.GENERATE, result.failure().step());
    // Parsed, not read: the file at that path is a template that WOULD have
    // rendered, and the failure is a parse of the path string itself.
    assertEquals("parse", result.failure().kind());
  }

  @Test
  void rootContainmentDoesNotApplyToCallerSuppliedSources() {
    // There is no root to be contained by — which is exactly why a strict client
    // refuses this entrance rather than trying to police it.
    assertTrue(
        client().build().generateSource(sourceTemplate(textItem("customer.name"))).success());
  }

  @Test
  void definitionsMayRideAlongWithTheSources() {
    Result<DocumentArtifact> result =
        rootless()
            .build()
            .generateSource(
                sourceTemplate(textItem("customer.name")),
                readFixture("receipt/definitions.yml"),
                null,
                Map.of("customer", Map.of("name", "Yamada")),
                null);

    assertTrue(result.success());
  }

  @Test
  void bundledAssetsResolveAgainstAPerCallDirectory() {
    // Per call rather than per client, because bundled assets belong to a template
    // rather than to a deployment.
    Result<DocumentArtifact> result =
        rootless()
            .build()
            .generateSource(
                sourceTemplate(imageItem()), null, Paths.get(SOURCE_ASSETS), null, null);

    assertTrue(result.success());
    assertTrue(result.errors().isEmpty());
  }

  @Test
  void withoutAnAssetsDirectoryABundledSourceIsRefusedRatherThanGuessed() {
    assertTrue(rootless().build().generateSource(sourceTemplate(imageItem())).failed());
  }

  @Test
  void aPerCallLocaleAppliesToTheTextEntranceToo() {
    Result<DocumentArtifact> result =
        rootless()
            .lang("en-US")
            .build()
            .generateSource(sourceTemplate(textItem("customer.name")), null, null, null, "ja-JP");

    assertTrue(result.success());
  }

  @Test
  void aSourceThatWillNotParseIsAFailedResult() {
    Result<DocumentArtifact> result =
        client().build().generateSource("this: is: not: a: template\n");

    assertTrue(result.failed());
    assertEquals("parse", result.failure().kind());
  }

  private static String readFixture(String name) {
    try {
      return Files.readString(Paths.get(TEMPLATES, name.split("/")));
    } catch (java.io.IOException error) {
      throw new IllegalStateException(error);
    }
  }
}
