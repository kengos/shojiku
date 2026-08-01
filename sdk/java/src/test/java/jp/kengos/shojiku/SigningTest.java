package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Signing, and the four surfaces a secret must not leak through.
 *
 * <p>Each redaction surface is its own test, because they reach different audiences: a caught
 * failure reaches a catch clause, a printed provider reaches a console or a debugger, and a log
 * line reaches an aggregator that keeps it for a year.
 */
class SigningTest extends Fixtures {

  @Test
  void signingAppendsARevisionRatherThanRewriting() {
    ShojikuClient client = client().build();
    DocumentArtifact rendered = rendered(client);

    Result<DocumentArtifact> result = client.sign(rendered, signer());

    assertTrue(result.success());
    // The signed bytes begin with the input byte for byte.
    byte[] original = rendered.bytes();
    assertArrayEquals(original, Arrays.copyOf(result.artifact().bytes(), original.length));
    assertTrue(result.artifact().size() > rendered.size());
  }

  @Test
  void aSignedArtifactHasNoPageCount() {
    // Absent, not zero: signing appends a revision to bytes it never laid out, and
    // a zero would read as "a document with no pages".
    assertNull(signed(client().build()).pageCount());
  }

  @Test
  void signingInheritsTheOriginOfWhatItSigned() {
    // Appending a revision does not launder where a document came from.
    ShojikuClient client = client().build();
    DocumentArtifact fromSource = client.generateSource(receiptSource()).unwrap();

    assertEquals(Origin.RENDERED, client.sign(rendered(client), signer()).unwrap().origin());
    assertEquals(Origin.SOURCE, client.sign(fromSource, signer()).unwrap().origin());
  }

  @Test
  void theArtifactCanSignItself() {
    assertTrue(rendered(client().build()).sign(signer()).success());
  }

  @Test
  void aKeyThatCannotBeReadIsAFailedResultNotAnException() {
    // A host-side cause, not a bug in the calling program: the file may have been
    // rotated away between deploy and request.
    ShojikuClient client = client().build();
    LocalPem missing = new LocalPem(key("nope.key.pem"), key("rsa2048.cert.pem"));

    Result<DocumentArtifact> result = client.sign(rendered(client), missing);

    assertTrue(result.failed());
    assertEquals(Step.SIGN, result.failure().step());
    assertEquals("key_unreadable", result.failure().kind());
  }

  @Test
  void aCertificateThatCannotBeReadIsAFailedResultToo() {
    ShojikuClient client = client().build();
    LocalPem missing = new LocalPem(key("rsa2048.key.pem"), key("nope.cert.pem"));

    Result<DocumentArtifact> result = client.sign(rendered(client), missing);

    assertTrue(result.failed());
    assertEquals("certificate_unreadable", result.failure().kind());
  }

  @Test
  void aKeyTheEngineRefusesIsAFailedResultWithTheEnginesOwnKind() throws IOException {
    ShojikuClient client = client().build();
    LocalPem garbage =
        LocalPem.builder()
            .keyPem(
                "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n"
                    .getBytes(StandardCharsets.US_ASCII))
            .certPem(Files.readAllBytes(key("rsa2048.cert.pem")))
            .build();

    Result<DocumentArtifact> result = client.sign(rendered(client), garbage);

    assertTrue(result.failed());
    assertEquals(Step.SIGN, result.failure().step());
  }

  // ---- the four redaction surfaces -------------------------------------

  @Test
  void noFailureMessageEchoesKeyMaterial() throws IOException {
    // Surface one: what a caught failure carries. The engine builds its refusals
    // from fixed strings, and this binding adds nothing.
    String secret = "SUPERSECRETKEYBODY";
    ShojikuClient client = client().build();
    LocalPem garbage =
        LocalPem.builder()
            .keyPem(
                ("-----BEGIN PRIVATE KEY-----\n" + secret + "\n-----END PRIVATE KEY-----\n")
                    .getBytes(StandardCharsets.US_ASCII))
            .certPem(Files.readAllBytes(key("rsa2048.cert.pem")))
            .passphrase("hunter2")
            .build();

    Result<DocumentArtifact> result = client.sign(rendered(client), garbage);

    assertTrue(result.failed());
    for (Failure failure : result.failure().causes()) {
      assertFalse(failure.message().contains(secret));
      assertFalse(failure.message().contains("hunter2"));
    }
  }

  @Test
  void aProvidersOwnPrintedFormIsRedacted() {
    // Surface two: a debugger's display, a structured logger, or any message that
    // interpolates the provider. The path is not secret and is the one thing worth
    // seeing; the bytes never are.
    LocalPem provider = new LocalPem(Path.of("/keys/signer.key"), Path.of("/keys/signer.crt"));

    String printed = provider.toString();

    assertTrue(printed.contains("/keys/signer.key"));
    assertTrue(printed.contains("passphrase=none"));
  }

  @Test
  void aProvidersPrintedFormNeverShowsBytesOrAPassphrase() {
    // Surface three, and a different failure than the one above: material held in
    // memory has no path to show, and a passphrase has no safe form at all.
    LocalPem provider =
        LocalPem.builder()
            .keyPem("-----BEGIN PRIVATE KEY-----\nSECRETBODY\n".getBytes(StandardCharsets.US_ASCII))
            .certPem("-----BEGIN CERTIFICATE-----\nCERTBODY\n".getBytes(StandardCharsets.US_ASCII))
            .passphrase("hunter2")
            .build();

    String printed = provider.toString();

    assertFalse(printed.contains("SECRETBODY"));
    assertFalse(printed.contains("CERTBODY"));
    assertFalse(printed.contains("hunter2"));
    assertTrue(printed.contains("[pem bytes]"));
    assertTrue(printed.contains("passphrase=[redacted]"));
  }

  @Test
  void theLogChannelNeverCarriesKeyMaterialOrDocumentContent() {
    // Surface four, the one that reaches an aggregator and stays there. The channel
    // reports what the BINDING did and nothing about the document.
    List<String> lines = new ArrayList<>();
    ShojikuClient client = client().logger(lines::add).build();

    client.sign(rendered(client), signer());

    assertFalse(lines.isEmpty());
    String log = String.join("\n", lines);
    assertFalse(log.contains("Yamada"));
    assertFalse(log.contains("BEGIN PRIVATE KEY"));
    assertFalse(log.contains("%PDF"));
    assertTrue(log.contains("shojiku sign"));
  }

  // ---- explicit, never sniffed, in both directions ----------------------

  @Test
  void passingBothFormsOfTheSameMaterialIsProgrammerMisuse() {
    // Preferring one would ignore the argument the caller meant, on the path where
    // reading the wrong key matters most.
    assertThrows(
        UsageException.class,
        () ->
            LocalPem.builder()
                .key(Path.of("/k.pem"))
                .keyPem(new byte[] {1})
                .cert(Path.of("/c.pem"))
                .build());
    assertThrows(
        UsageException.class,
        () ->
            LocalPem.builder()
                .key(Path.of("/k.pem"))
                .cert(Path.of("/c.pem"))
                .certPem(new byte[] {1})
                .build());
  }

  @Test
  void passingNeitherFormIsProgrammerMisuseToo() {
    assertThrows(UsageException.class, () -> LocalPem.builder().cert(Path.of("/c.pem")).build());
    assertThrows(UsageException.class, () -> LocalPem.builder().key(Path.of("/k.pem")).build());
  }

  @Test
  void materialHeldInMemoryNeverTouchesTheFilesystem() {
    LocalPem provider =
        LocalPem.builder()
            .keyPem(new byte[] {1, 2, 3})
            .certPem(new byte[] {4, 5, 6})
            .passphrase(new byte[] {7})
            .build();

    assertArrayEquals(new byte[] {1, 2, 3}, provider.key());
    assertArrayEquals(new byte[] {4, 5, 6}, provider.certificate());
    assertArrayEquals(new byte[] {7}, provider.passphrase());
  }

  @Test
  void aProviderWithNoPassphraseReportsNone() {
    assertNull(
        LocalPem.builder()
            .keyPem(new byte[] {1})
            .certPem(new byte[] {2})
            .passphrase((String) null)
            .build()
            .passphrase());
  }
}
