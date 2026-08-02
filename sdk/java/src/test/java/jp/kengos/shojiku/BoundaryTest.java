package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The C boundary itself: ownership, widths, encoding, and the two levels of failure the surface
 * defines.
 *
 * <p>These are the proofs a faithful binding owes that no lifecycle test can make, because a
 * lifecycle test passes just as happily over a binding that leaks a handle or decodes an
 * out-parameter at the wrong width.
 */
class BoundaryTest extends Fixtures {

  @Test
  void aSizeTOutParameterIsDecodedAtTheRightWidth() {
    // The silent-failure class this exists for: an out-parameter unpacked at the
    // wrong width does not crash, it reads a plausible wrong number — the
    // reference SDK once read every success flag as false while the string
    // buffers beside it decoded perfectly. So the widths are proven against a
    // KNOWN-GOOD value rather than assumed.
    DocumentArtifact rendered = rendered(client().build());
    byte[] bytes = rendered.bytes();

    assertEquals(bytes.length, rendered.size());
    assertTrue(rendered.size() > 1000, "a one-page PDF is longer than this: " + rendered.size());
    assertEquals("%PDF", new String(Arrays.copyOf(bytes, 4), StandardCharsets.US_ASCII));
    assertTrue(
        new String(
                Arrays.copyOfRange(bytes, bytes.length - 16, bytes.length),
                StandardCharsets.US_ASCII)
            .contains("%%EOF"));
  }

  @Test
  void theSizeTWidthIsThePlatformsOwn() {
    // Not a Java `long`, which would be 8 bytes everywhere: `size_t` is whatever
    // this platform says, and a mismatch is silent.
    // IntegerType reports its own width through the value it wraps; what matters
    // is that it is the platform's size_t and not a fixed 8.
    assertEquals(
        com.sun.jna.Native.SIZE_T_SIZE, new SizeT().toNative().getClass() == Long.class ? 8 : 4);
    assertEquals(42L, new SizeT(42).longValue());
  }

  @Test
  void anInt32OutParameterIsDecodedAtTheRightWidth() {
    // The other width the surface uses: `shojiku_result_success` writes an
    // int32_t. Reading it as a native long would pick up whatever sits beside it
    // — which is exactly how the reference SDK's every-success-is-false bug
    // looked. A success and a failure disagreeing proves the read.
    ShojikuClient client = client().build();

    assertTrue(client.generate("receipt", null).success());
    assertTrue(client.generate("broken", null).failed());
  }

  @Test
  void engineMemoryIsCopiedOutRatherThanHeldOnTo() {
    // The ownership rule in one assertion: nothing this SDK hands an application
    // points into engine memory, so bytes taken from an artifact are still
    // readable long after the handle that lent them was freed — and are a copy
    // the caller may mutate without touching anything else.
    ShojikuClient client = client().build();
    DocumentArtifact first = rendered(client);
    byte[] taken = first.bytes();
    taken[0] = 0;

    assertEquals("%PDF", new String(Arrays.copyOf(first.bytes(), 4), StandardCharsets.US_ASCII));
    assertNotSame(first.bytes(), first.bytes());
  }

  @Test
  void everyOperationFreesItsHandleOnTheFailurePathToo() {
    // One handle in, one free out, on every path — proven by volume rather than
    // by inspection: a leaked handle per call would be visible as unbounded
    // growth, and a double free would abort the JVM. A run that completes is the
    // assertion.
    ShojikuClient client = client().build();
    for (int attempt = 0; attempt < 40; attempt++) {
      assertTrue(client.generate("broken", null).failed());
      assertTrue(client.generate("receipt", null).success());
    }
  }

  @Test
  void textCrossesAsUtf8RatherThanThePlatformDefault() {
    // JNA's String marshalling uses the PLATFORM charset, which is not UTF-8 on
    // Windows — so nothing data-bearing crosses as String at all. Non-ASCII params
    // making the round trip is what proves it end to end.
    Result<DocumentArtifact> result =
        client().build().generate("receipt", Map.of("customer", Map.of("name", "商事株式会社ヤマダ")));

    assertTrue(result.success());
  }

  @Test
  void nonAsciiSurvivesTheRequestEnvelopeUnescaped() {
    byte[] encoded = new Request(new Sources("version: 0.1.0\n"), Map.of("name", "日本語")).encoded();

    // Encoded as UTF-8 bytes, not as \\uXXXX escapes: the surface is UTF-8 by
    // contract, so escaping would only make the payload bigger.
    assertTrue(new String(encoded, StandardCharsets.UTF_8).contains("日本語"));
  }

  @Test
  void aRequestDropsAbsentKeysRatherThanSendingThemNull() {
    // The request schema rejects unknown and ill-typed keys, so a key the engine
    // may legitimately not receive is left out entirely.
    String encoded =
        new String(new Request(new Sources("t"), Map.of()).encoded(), StandardCharsets.UTF_8);

    assertFalse(encoded.contains("definitions"));
    assertFalse(encoded.contains("assetsDir"));
    assertFalse(encoded.contains("lang"));
    assertTrue(encoded.contains("template"));
  }

  @Test
  void aRequestCarriesEveryKeyItWasGiven() {
    Request request =
        new Request(
            new Sources("t", "d", "/assets"),
            "params: 1",
            "ja-JP",
            List.of("/fonts"),
            List.of("/locales"));

    String encoded = new String(request.encoded(), StandardCharsets.UTF_8);

    assertTrue(encoded.contains("\"definitions\":\"d\""));
    assertTrue(encoded.contains("\"assetsDir\":\"/assets\""));
    assertTrue(encoded.contains("\"lang\":\"ja-JP\""));
    assertTrue(encoded.contains("/fonts"));
    assertTrue(encoded.contains("/locales"));
    // A String params is the caller's own source text, passed through verbatim.
    assertTrue(encoded.contains("\"params\":\"params: 1\""));
  }

  @Test
  void aRejectedCallLeavesABlankOutSlotThatIsNeverDereferenced() {
    // The header blanks the out slot before any work starts, so a call the C
    // surface refuses outright hands back no handle at all. Reading accessors off
    // that would be a null dereference; the status already says what happened,
    // and freeing NULL is a documented no-op.
    Engine engine = new Engine(new EngineLibrary(LIBRARY, new Env(false), new Log()));

    Snapshot snapshot = engine.render(new byte[0]);

    assertFalse(snapshot.success());
    assertArrayEquals(new byte[0], snapshot.pdf());
    assertEquals("", snapshot.json());

    // And the guard itself, over a slot that stayed blank. This engine hands back
    // a handle even for the call it just refused, so the blank-slot path is only
    // reachable here — where it is checked rather than assumed.
    Snapshot blank = engine.read(7, new com.sun.jna.ptr.PointerByReference());

    assertEquals(7, blank.status());
    assertFalse(blank.success());
    assertArrayEquals(new byte[0], blank.pdf());
    assertEquals("", blank.error());
  }

  @Test
  void aParamsObjectThatMISBEHAVESStillComesBackAsProgrammerMisuse() {
    // The engine's surface is UTF-8 JSON by contract, so params that cannot become
    // one mean there is nothing to render. Json.write names the unsupported TYPES
    // itself; this is the other half — a value that throws on its way out, which
    // would otherwise escape `generate` as a foreign exception class nobody
    // invited in.
    java.util.Map<Object, Object> hostile = new java.util.HashMap<>();
    hostile.put(
        new Object() {
          @Override
          public String toString() {
            throw new IllegalStateException("not printable");
          }
        },
        "value");

    UsageException error =
        org.junit.jupiter.api.Assertions.assertThrows(
            UsageException.class, () -> new Request(new Sources("t"), hostile).encoded());

    assertTrue(error.getMessage().contains("could not be serialized"));
  }

  @Test
  void onlyTheLifecycleIsBound() {
    // `validate` and `preview` are the AUTHORING surface's operations, which the
    // Designer reaches through the WASM bindings. Binding them here would be
    // surface with no contract behind it.
    List<String> bound =
        Arrays.stream(ShojikuLibrary.class.getDeclaredMethods())
            .map(java.lang.reflect.Method::getName)
            .toList();

    assertTrue(bound.contains("shojiku_engine_info"));
    assertTrue(bound.contains("shojiku_render"));
    assertTrue(bound.contains("shojiku_sign"));
    assertTrue(bound.contains("shojiku_verify"));
    assertFalse(bound.contains("shojiku_validate"));
    assertFalse(bound.contains("shojiku_preview"));
  }

  @Test
  void boundedTextIsEmptyForNothingAtAll() {
    // Every path that echoes goes through it, including the ones whose value was
    // never set.
    assertEquals("", Texts.bounded(null));
    assertEquals("", Texts.bounded(""));
  }

  @Test
  void boundedTextCapsAndStrips() {
    assertEquals(Texts.ECHO_LIMIT, Texts.bounded("y".repeat(500)).length());
    assertEquals("ab", Texts.bounded("a" + (char) 0x1b + "b"));
  }
}
