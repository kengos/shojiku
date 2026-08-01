package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The lockdown, one clause at a time.
 *
 * <p>A lockdown tested as a whole reports "something was refused" and stops proving which rule did
 * it. Each clause below is its own test for that reason.
 *
 * <p>Every refusal here is the misuse EXCEPTION rather than a failed result: strict disables an
 * ENTRANCE, so calling it is the program contradicting its own deployment's configuration — not a
 * fact about a document — and a failed result is something {@code if (result.success())} can
 * swallow.
 */
class LockdownTest extends Fixtures {

  private static Map<String, SigningProvider> registry() {
    return Map.of("release", signer());
  }

  @Test
  void aStrictClientRefusesTheTextEntrance() {
    // Clause one: every document a strict client signs came from the configured
    // template root, with its containment rules.
    ShojikuClient client = client().strict(true).providers(registry()).build();

    UsageException error =
        assertThrows(UsageException.class, () -> client.generateSource("version: 0.1.0\n"));

    assertTrue(error.getMessage().contains("generateSource"));
  }

  @Test
  void aStrictClientStillRendersFromItsOwnRoot() {
    assertTrue(
        client().strict(true).providers(registry()).build().generate("receipt", null).success());
  }

  @Test
  void aStrictClientRefusesToSignAnArtifactItDidNotRender() {
    // Clause two. Bytes handed over whole are the caller's, exactly like a
    // caller-supplied template.
    ShojikuClient strict = client().strict(true).providers(registry()).build();
    DocumentArtifact archived = strict.artifact(rendered(client().build()).bytes());

    UsageException error =
        assertThrows(UsageException.class, () -> strict.sign(archived, "release"));

    assertTrue(error.getMessage().contains("loaded"));
  }

  @Test
  void aStrictClientRefusesToSignASourceArtifactToo() {
    // The gap a boolean "was it loaded" would leave open: an artifact from another
    // client's text-first render has engine-laid-out bytes and a caller's template.
    DocumentArtifact fromSource = client().build().generateSource(receiptSource()).unwrap();
    ShojikuClient strict = client().strict(true).providers(registry()).build();

    UsageException error =
        assertThrows(UsageException.class, () -> strict.sign(fromSource, "release"));

    assertTrue(error.getMessage().contains("source"));
  }

  @Test
  void anArtifactAStrictClientWillNotSignIsStillVerifiable() {
    // Clause three, and the deliberate asymmetry: verifying bytes of unknown
    // provenance is the entire point of verify, and a locked-down deployment is
    // precisely the one that must check an archived document it did not produce.
    byte[] archived = signed(client().build()).bytes();
    ShojikuClient strict = client().strict(true).providers(registry()).build();

    assertTrue(
        strict.artifact(archived).verify(java.util.List.of(key("rsa2048.cert.pem"))).success());
  }

  @Test
  void aStrictClientRefusesAProviderObject() {
    // Clause four: signing material must be a provider REGISTERED in configuration,
    // so a key path never appears in request-handling code.
    ShojikuClient strict = client().strict(true).providers(registry()).build();

    UsageException error =
        assertThrows(UsageException.class, () -> strict.sign(rendered(strict), signer()));

    assertTrue(error.getMessage().contains("registered"));
  }

  @Test
  void aStrictClientSignsWithARegisteredName() {
    ShojikuClient strict = client().strict(true).providers(registry()).build();

    assertTrue(strict.sign(rendered(strict), "release").success());
  }

  @Test
  void anUnknownProviderNameIsNamedWithoutEchoingAnythingUnbounded() {
    // Clause five. The name reaches an exception reporter, so it is bounded and
    // stripped exactly as a template name is.
    ShojikuClient strict = client().strict(true).providers(registry()).build();
    String hostile = "z".repeat(500);

    UsageException error =
        assertThrows(UsageException.class, () -> strict.sign(rendered(strict), hostile));

    assertTrue(error.getMessage().contains("no signing provider named"));
    assertFalse(error.getMessage().contains("z".repeat(200)));
  }

  @Test
  void configuredStrictnessSurvivesACallSiteThatAsksForStrictFalse() {
    // Clause six, and the ONE place configuration beats a call site: a restriction
    // an operator declared must not be liftable by application code.
    Configuration.configure(config -> config.withStrict(true).withProviders(registry()));

    ShojikuClient client = client().strict(false).providers(registry()).build();

    assertThrows(UsageException.class, () -> client.generateSource("version: 0.1.0\n"));
  }

  @Test
  void aNameResolvesToARegisteredProviderOutsideStrictModeToo() {
    // Naming providers is good practice everywhere; only the REFUSAL of the
    // alternative is strict's.
    ShojikuClient client = client().providers(registry()).build();

    assertTrue(client.sign(rendered(client), "release").success());
  }

  @Test
  void anUnknownNameIsRefusedOutsideStrictModeAsWell() {
    ShojikuClient client = client().providers(registry()).build();

    assertThrows(UsageException.class, () -> client.sign(rendered(client), "staging"));
  }

  @Test
  void somethingThatIsNotAProviderAtAllIsProgrammerMisuse() {
    ShojikuClient client = client().build();

    UsageException error =
        assertThrows(
            UsageException.class, () -> client.sign(rendered(client), Integer.valueOf(42)));

    assertTrue(error.getMessage().contains("SigningProvider"));
  }

  @Test
  void aNonStrictClientNeedsNoRegistryAtAll() {
    ShojikuClient client = client().build();

    assertTrue(client.sign(rendered(client), signer()).success());
  }
}
