package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * One flag governs every SHOJIKU_* lookup.
 *
 * <p>One rather than one per variable is the reference decision the other six SDKs mirror: an
 * application that wants a hermetic configuration wants all of it off, and a per-variable set of
 * knobs is a shape nobody can keep consistent across seven languages.
 */
class EnvTest extends Fixtures {

  @Test
  void anEnabledLookupReadsTheVariable() {
    Env env = new Env(true, Map.of("SHOJIKU_TEMPLATE_ROOT", "/templates"));

    assertEquals("/templates", env.get("SHOJIKU_TEMPLATE_ROOT"));
  }

  @Test
  void aDisabledLookupBehavesExactlyAsAnUnsetVariableDoes() {
    // So calling code has no second branch to get wrong.
    Env disabled = new Env(false, Map.of("SHOJIKU_TEMPLATE_ROOT", "/templates"));

    assertNull(disabled.get("SHOJIKU_TEMPLATE_ROOT"));
    assertEquals(List.of(), disabled.paths("SHOJIKU_FONT_DIR"));
  }

  @Test
  void anUnsetOrBlankVariableIsNothingRatherThanAnEmptyString() {
    assertNull(new Env(true, Map.of()).get("SHOJIKU_TEMPLATE_ROOT"));
    assertNull(new Env(true, Map.of("SHOJIKU_TEMPLATE_ROOT", "")).get("SHOJIKU_TEMPLATE_ROOT"));
  }

  @Test
  void severalPathsRideInOneVariableTheWayEveryOtherToolSpellsIt() {
    String separator = File.pathSeparator;
    Env env =
        new Env(
            true,
            Map.of("SHOJIKU_FONT_DIR", "/a" + separator + "/b" + separator + separator + "/c"));

    assertEquals(List.of("/a", "/b", "/c"), env.paths("SHOJIKU_FONT_DIR"));
  }

  @Test
  void anUnsetPathVariableIsNoPathsAtAll() {
    assertEquals(List.of(), new Env(true, Map.of()).paths("SHOJIKU_FONT_DIR"));
  }

  @Test
  void theRealEnvironmentIsTheDefaultSource() {
    // The gate image sets this one, which is what makes it a usable probe: a Java
    // process cannot set a variable in its own environment.
    assertEquals(LIBRARY, new Env(true).get("SHOJIKU_LIBRARY"));
    assertNull(new Env(false).get("SHOJIKU_LIBRARY"));
  }

  @Test
  void oneFlagGovernsThePackDirectoriesToo() {
    // Off, and with nothing configured either: the packs come from nowhere, so a
    // template needing a font cannot render.
    ShojikuClient hermetic =
        ShojikuClient.builder().templates(TEMPLATES).library(LIBRARY).env(false).build();

    assertTrue(hermetic.generate("receipt", null).failed());
  }

  @Test
  void explicitPackDirectoriesAreWhatTheClientUses() {
    // The same client with the packs named explicitly renders — which is the other
    // half of the assertion above.
    assertTrue(client().build().generate("receipt", null).success());
  }
}
