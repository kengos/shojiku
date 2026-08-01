package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Verification, and the no-false-assurance rule that shapes it.
 *
 * <p>A signature that does not verify is a FAILED result — so a caller who checks only success is
 * never told a forgery is fine — and the report rides that failed result, because {@code
 * notChecked} must reach the caller either way.
 */
class VerificationTest extends Fixtures {

  @Test
  void aGoodSignatureVerifiesAgainstTheCertificateThatSignedIt() {
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(signed(client), List.of(key("rsa2048.cert.pem")), null);

    assertTrue(result.success());
    assertNotNull(result.report());
    assertTrue(result.report().valid());
    assertTrue(result.report().signature().passed());
    assertTrue(result.report().coverage().passed());
  }

  @Test
  void thePassingVerdictStillNamesWhatWasNotChecked() {
    // The no-false-assurance rule on the PASSING path, which is the one a binding
    // is most likely to quietly drop.
    ShojikuClient client = client().build();

    VerificationReport report =
        client.verify(signed(client), List.of(key("rsa2048.cert.pem")), null).unwrap();

    assertEquals(List.of("revocation", "timestamp"), report.notChecked());
  }

  @Test
  void theFailingVerdictNamesThemToo() {
    // The other half, and the whole point of carrying notChecked: it must reach
    // the caller either way, so the report rides a FAILED result too.
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(tampered(client), List.of(key("rsa2048.cert.pem")), null);

    assertTrue(result.failed());
    assertNotNull(result.report());
    assertEquals(List.of("revocation", "timestamp"), result.report().notChecked());
  }

  @Test
  void alteredBytesFailTheResultAndSayWhichCheck() {
    // The four checks stay separate: "valid but covers only part of the file" is
    // a different fact from "the signature is wrong".
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(tampered(client), List.of(key("rsa2048.cert.pem")), null);

    assertTrue(result.failed());
    assertFalse(result.report().valid());
    assertFalse(result.report().signature().passed());
    assertTrue(result.report().coverage().passed());
    assertEquals("signature", result.failure().kind());
    assertEquals(Step.VERIFY, result.failure().step());
  }

  @Test
  void theFourChecksHaveNamesACallerCanBranchOn() {
    ShojikuClient client = client().build();

    VerificationReport report =
        client.verify(signed(client), List.of(key("rsa2048.cert.pem")), null).unwrap();

    assertEquals(
        List.of("certificateValidity", "coverage", "signature", "trustChain"),
        report.checks().keySet().stream().sorted().toList());
  }

  @Test
  void anAnchorThatSignedNothingHereFailsTheChain() {
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(signed(client), List.of(key("other-ca.cert.pem")), null);

    assertTrue(result.failed());
    assertNotNull(result.report());
    assertFalse(result.report().trustChain().passed());
  }

  @Test
  void aChainIssuedLeafVerifiesAgainstItsAuthority() {
    ShojikuClient client = client().build();
    LocalPem leaf = new LocalPem(key("leaf.key.pem"), key("leaf.cert.pem"));
    DocumentArtifact document = client.sign(rendered(client), leaf).unwrap();

    Result<VerificationReport> result = client.verify(document, List.of(key("ca.cert.pem")), null);

    assertTrue(result.success());
    assertTrue(result.unwrap().trustChain().passed());
  }

  @Test
  void anExpiredCertificateFailsValidityRatherThanTheSignature() {
    ShojikuClient client = client().build();
    LocalPem expired = new LocalPem(key("leaf.key.pem"), key("leaf-expired.cert.pem"));
    DocumentArtifact document = client.sign(rendered(client), expired).unwrap();

    VerificationReport report = client.verify(document, List.of(key("ca.cert.pem")), null).report();

    assertNotNull(report);
    assertFalse(report.certificateValidity().passed());
    assertTrue(report.signature().passed());
  }

  @Test
  void aDocumentWithNoSignatureInItGivesNoReportAtAll() {
    // A document that cannot be evaluated at all has NO report, which is a
    // different fact from an empty one.
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(
            client.artifact(rendered(client).bytes()), List.of(key("rsa2048.cert.pem")), null);

    assertTrue(result.failed());
    assertNull(result.report());
  }

  @Test
  void severalAnchorFilesAreTakenAtOnceAsTheCliTakesSeveralFlags() {
    ShojikuClient client = client().build();

    assertTrue(
        client
            .verify(
                signed(client), List.of(key("other-ca.cert.pem"), key("rsa2048.cert.pem")), null)
            .success());
  }

  @Test
  void anchorsMayBeBytesForACertificateThatNeverTouchedDisk() throws IOException {
    ShojikuClient client = client().build();

    assertTrue(
        client.verify(signed(client), null, Files.readAllBytes(key("rsa2048.cert.pem"))).success());
  }

  @Test
  void unusableAnchorBytesAreAFailedResult() {
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(signed(client), null, "not a pem at all".getBytes(StandardCharsets.US_ASCII));

    assertTrue(result.failed());
    assertEquals("anchors", result.failure().kind());
  }

  @Test
  void anUnreadableAnchorFileIsAFailedResultNotAnException() {
    ShojikuClient client = client().build();

    Result<VerificationReport> result =
        client.verify(signed(client), List.of(Path.of("/nonexistent/anchor.pem")), null);

    assertTrue(result.failed());
    assertEquals("anchor_unreadable", result.failure().kind());
    assertEquals(Step.VERIFY, result.failure().step());
  }

  @Test
  void anchorsAreRequiredBecauseThereIsNoTrustStoreToFallBackOn() {
    // The engine never consults the machine's trust store, so a default would
    // answer a different question than the caller asked.
    ShojikuClient client = client().build();

    UsageException error =
        assertThrows(UsageException.class, () -> client.verify(signed(client), null, null));

    assertTrue(error.getMessage().contains("needs"));
  }

  @Test
  void passingBothAnchorFormsIsProgrammerMisuse() {
    ShojikuClient client = client().build();

    assertThrows(
        UsageException.class,
        () -> client.verify(signed(client), List.of(Path.of("/a.pem")), new byte[] {1}));
  }

  @Test
  void theArtifactCanVerifyItself() {
    ShojikuClient client = client().build();

    assertTrue(signed(client).verify(List.of(key("rsa2048.cert.pem"))).success());
  }

  @Test
  void theArtifactCanVerifyItselfFromAnchorBytes() throws IOException {
    ShojikuClient client = client().build();

    assertTrue(signed(client).verifyPem(Files.readAllBytes(key("rsa2048.cert.pem"))).success());
  }

  @Test
  void anArchivedDocumentVerifiesAfterReEntry() {
    // The whole point of `artifact(bytes)`: a document signed some time ago, read
    // back from wherever it was stored — and verification is never restricted, so
    // even a strict client can check it.
    byte[] archived = signed(client().build()).bytes();
    ShojikuClient strict = client().strict(true).providers(Map.of()).build();

    assertTrue(strict.artifact(archived).verify(List.of(key("rsa2048.cert.pem"))).success());
  }

  /**
   * A signed document with one byte of the ORIGINAL body flipped.
   *
   * <p>Corrupting the middle of the SIGNED file lands in the appended revision instead, which
   * leaves a container the verifier cannot parse a signature out of at all — no report, which is a
   * different outcome from the one these tests are about.
   */
  private static DocumentArtifact tampered(ShojikuClient client) {
    DocumentArtifact rendered = rendered(client);
    byte[] bytes = client.sign(rendered, signer()).unwrap().bytes();
    bytes[rendered.size() / 2] ^= (byte) 0xFF;
    return client.artifact(bytes);
  }
}
