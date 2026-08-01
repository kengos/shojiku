package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The artifact an application receives: bytes and metadata, never a handle. */
class DocumentArtifactTest extends Fixtures {

  @Test
  void anArtifactCarriesTheBytesAndWhatTheEngineKnowsAboutThem() {
    DocumentArtifact rendered = rendered(client().build());

    assertEquals(1, rendered.pageCount());
    assertEquals(rendered.bytes().length, rendered.size());
    assertFalse(rendered.loaded());
    assertEquals(Origin.RENDERED, rendered.origin());
  }

  @Test
  void writingIsBinarySoAPdfSurvivesEveryByteValue() throws IOException {
    // A PDF contains NUL and every other byte value, and a text write would
    // translate line endings on Windows.
    DocumentArtifact rendered = rendered(client().build());
    Path path = Files.createTempFile("shojiku", ".pdf");
    try {
      assertEquals(path, rendered.write(path));
      assertArrayEquals(rendered.bytes(), Files.readAllBytes(path));
    } finally {
      Files.deleteIfExists(path);
    }
  }

  @Test
  void theBytesHandedOutAreACopy() {
    // An application that mutates what it was handed must not be able to change
    // what another holder sees — and nothing here points into engine memory.
    DocumentArtifact rendered = rendered(client().build());
    byte[] taken = rendered.bytes();
    taken[0] = 0;

    assertEquals('%', (char) rendered.bytes()[0]);
  }

  @Test
  void aRenderedArtifactIsNotLoadedAndALoadedOneIs() {
    ShojikuClient client = client().build();
    DocumentArtifact rendered = rendered(client);

    assertFalse(rendered.loaded());
    assertTrue(client.artifact(rendered.bytes()).loaded());
  }

  @Test
  void theThreeOriginsAreTheOnlyOnesThereAre() {
    // A boolean "was it loaded" would not be enough: an artifact from another
    // client's text-first render has engine-laid-out bytes and a caller's template,
    // which is a third trust class.
    assertEquals(
        List.of("loaded", "rendered", "source"),
        Arrays.stream(Origin.values()).map(Origin::toString).toList());
  }

  @Test
  void anArtifactCarriesWhateverTheEngineNoticedWhileProducingIt() {
    // On the artifact as well as on the result: a caller who kept only the document
    // still has what the engine said about it.
    DocumentArtifact warned = client().build().generate("warns", null).unwrap();

    assertFalse(warned.diagnostics().isEmpty());
    assertTrue(rendered(client().build()).diagnostics().isEmpty());
  }
}
