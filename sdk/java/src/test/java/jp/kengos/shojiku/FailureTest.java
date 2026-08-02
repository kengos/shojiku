package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;

/** The failure trace: a value, with the chain underneath it inspectable rather than unwound. */
class FailureTest extends Fixtures {

  @Test
  void aFailureReadsItselfOffTheEnginesErrorPayload() {
    Failure failure =
        Failure.fromErrorJson(
            "{\"kind\":\"render_failed\",\"message\":\"no font\"}", Step.GENERATE, null, null);

    assertEquals(Step.GENERATE, failure.step());
    assertEquals("render_failed", failure.kind());
    assertEquals("no font", failure.message());
    assertNull(failure.cause());
    assertEquals(List.of(), failure.diagnostics());
  }

  @Test
  void anAbsentOrEmptyPayloadStillProducesAUsableFailure() {
    for (String payload : new String[] {null, ""}) {
      Failure failure = Failure.fromErrorJson(payload, Step.VERIFY, null, null);

      assertEquals("unknown", failure.kind());
      assertEquals("", failure.message());
    }
  }

  @Test
  void aPayloadMissingItsKeysFallsBackRatherThanThrowing() {
    Failure failure = Failure.fromErrorJson("{\"other\":1}", Step.SIGN, null, null);

    assertEquals("unknown", failure.kind());
    assertEquals("", failure.message());
  }

  @Test
  void causesFlattenTheChainOutermostFirst() {
    // What you log when you want the whole story rather than only its headline.
    Failure root = new Failure(Step.GENERATE, "io", "disk");
    Failure middle = new Failure(Step.GENERATE, "template_unreadable", "unreadable", null, root);
    Failure outer = new Failure(Step.GENERATE, "template_name", "refused", null, middle);

    assertEquals(
        List.of("refused", "unreadable", "disk"),
        outer.causes().stream().map(Failure::message).toList());
    assertEquals(1, root.causes().size());
  }

  @Test
  void aFailurePrintsItsStepAndKind() {
    assertEquals(
        "sign/key_unreadable: nope", new Failure(Step.SIGN, "key_unreadable", "nope").toString());
  }

  @Test
  void theStepVocabularyIsTheSdksOwnThreeAndNothingElse() {
    // The engine's error object names an INTERNAL stage (render, validate).
    // Passing it through would make this field mean different things depending on
    // which layer refused.
    assertEquals(
        List.of("generate", "sign", "verify"),
        java.util.Arrays.stream(Step.values()).map(Step::toString).toList());
  }
}
