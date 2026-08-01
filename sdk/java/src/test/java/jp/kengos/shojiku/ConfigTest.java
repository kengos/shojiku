package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Precedence: what an explicit argument beats, what configuration beats, and the two places the
 * order deliberately reverses.
 */
class ConfigTest extends Fixtures {

  @Test
  void configureSetsProcessWideDefaults() {
    Configuration.configure(config -> config.withTemplates("/configured"));

    assertEquals("/configured", Configuration.current().templates());
  }

  @Test
  void anExplicitArgumentBeatsAConfiguredDefault() {
    // Configuration feeds the same builder; it never adds a precedence level of
    // its own.
    Configuration.configure(config -> config.withTemplates("/configured"));

    assertEquals(TEMPLATES, client().build().templateRootOrNull().path());
  }

  @Test
  void anAbsentArgumentInheritsTheConfiguredDefault() {
    Configuration.configure(config -> config.withTemplates(TEMPLATES).withLang("ja-JP"));

    assertEquals(TEMPLATES, rootless().build().templateRootOrNull().path());
  }

  @Test
  void strictIsTheOnePlaceConfigurationBeatsTheCallSite() {
    // A restriction an operator declared must not be liftable by application code:
    // `strict` is OR-ed rather than overridden.
    assertTrue(Config.empty().withStrict(true).merge(Config.empty().withStrict(false)).isStrict());
  }

  @Test
  void aCallSiteCanStillTightenWhatConfigurationLeftOpen() {
    assertTrue(Config.empty().withStrict(false).merge(Config.empty().withStrict(true)).isStrict());
  }

  @Test
  void providersReplaceRatherThanMerge() {
    // A client that declares its own registry is stating the whole set it may sign
    // with; quietly adding globally-registered keys would defeat the point.
    Map<String, SigningProvider> global = Map.of("global", signer());
    Map<String, SigningProvider> local = Map.of("local", signer());

    Config merged = Config.empty().withProviders(global).merge(Config.empty().withProviders(local));

    assertEquals(java.util.Set.of("local"), merged.providers().keySet());
  }

  @Test
  void aClientThatDeclaresNoRegistryInheritsTheConfiguredOne() {
    Configuration.configure(config -> config.withProviders(Map.of("release", signer())));

    ShojikuClient client = client().build();

    assertTrue(client.sign(rendered(client), "release").success());
  }

  @Test
  void resetDropsEveryConfiguredDefault() {
    // Public because a global that cannot be reset makes every test suite invent
    // its own teardown — and get it wrong in a randomly-ordered run.
    Configuration.configure(config -> config.withTemplates("/configured").withStrict(true));

    Configuration.reset();

    assertNull(Configuration.current().templates());
    assertFalse(Configuration.current().isStrict());
    assertTrue(Configuration.current().envEnabled());
  }

  @Test
  void everySettingSurvivesTheMerge() {
    ShojikuLogger logger = message -> {};
    Map<String, SigningProvider> providers = Map.of("p", signer());

    Config merged =
        Config.empty()
            .merge(
                Config.empty()
                    .withTemplates("/t")
                    .withFontDirs(List.of("/f"))
                    .withLocaleDirs(List.of("/l"))
                    .withLang("ja-JP")
                    .withLibrary("/lib.so")
                    .withLogger(logger)
                    .withStrict(true)
                    .withProviders(providers)
                    .withEnv(false));

    assertEquals("/t", merged.templates());
    assertEquals(List.of("/f"), merged.fontDirs());
    assertEquals(List.of("/l"), merged.localeDirs());
    assertEquals("ja-JP", merged.lang());
    assertEquals("/lib.so", merged.library());
    assertSame(logger, merged.logger());
    assertTrue(merged.isStrict());
    assertSame(providers, merged.providers());
    assertFalse(merged.envEnabled());
  }

  @Test
  void anAbsentOverrideLeavesTheDefaultAlone() {
    Config configured =
        Config.empty()
            .withTemplates("/t")
            .withFontDirs(List.of("/f"))
            .withLocaleDirs(List.of("/l"))
            .withLang("ja-JP")
            .withLibrary("/lib.so")
            .withEnv(false);

    Config merged = configured.merge(Config.empty());

    assertEquals("/t", merged.templates());
    assertEquals(List.of("/f"), merged.fontDirs());
    assertEquals(List.of("/l"), merged.localeDirs());
    assertEquals("ja-JP", merged.lang());
    assertEquals("/lib.so", merged.library());
    assertFalse(merged.envEnabled());
  }

  @Test
  void mergingProducesACopyRatherThanMutatingTheDefaults() {
    Config configured = Config.empty().withTemplates("/t");

    configured.merge(Config.empty().withTemplates("/other"));

    assertEquals("/t", configured.templates());
  }

  @Test
  void aPerClientLangIsWhatARenderDefaultsTo() {
    assertTrue(client().lang("ja-JP").build().generate("receipt", null).success());
  }

  @Test
  void environmentLookupsAreOnByDefault() {
    assertTrue(Config.empty().envEnabled());
  }
}
