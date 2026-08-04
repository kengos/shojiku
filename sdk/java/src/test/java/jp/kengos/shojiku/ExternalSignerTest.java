package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.Test;

/**
 * Signing with a key this process is never given.
 *
 * <p>The engine hands out bytes, something else signs them, and the finished document has to
 * verify. Nothing is stubbed: the function here signs with the JDK's own crypto over a key this
 * package never hands to the engine, which is exactly the shape a cloud key service takes from its
 * point of view.
 */
class ExternalSignerTest extends Fixtures {

  @Test
  void signingWithAKeyHeldElsewhereProducesADocumentThatVerifies() throws Exception {
    ShojikuClient client = client().build();
    DocumentArtifact rendered = rendered(client);

    Result<DocumentArtifact> result = client.sign(rendered, external("rsa2048"));

    assertTrue(result.success(), () -> String.valueOf(result.failure()));
    // Append-only: the signed bytes begin with the input byte for byte.
    byte[] signed = result.artifact().bytes();
    assertArrayEquals(rendered.bytes(), java.util.Arrays.copyOf(signed, rendered.bytes().length));
    assertTrue(client.verify(result.artifact(), List.of(key("rsa2048.cert.pem")), null).success());
  }

  @Test
  void signingWithAnEllipticCurveKey() throws Exception {
    ShojikuClient client = client().build();

    Result<DocumentArtifact> result =
        client.sign(rendered(client), external("ec256", Algorithm.ECDSA_P256_SHA256));

    assertTrue(result.success(), () -> String.valueOf(result.failure()));
  }

  @Test
  void theFunctionIsHandedTheSignedAttributesNotTheDocumentDigest() throws Exception {
    // The distinction the shorthand gets wrong: signing the digest instead
    // produces a document that fails verification.
    List<byte[]> seen = new ArrayList<>();
    UnaryOperator<byte[]> inner = signing("rsa2048", Algorithm.RSA_PKCS1_SHA256);
    ShojikuClient client = client().build();

    client.sign(
        rendered(client),
        ExternalSigner.of(
            toBeSigned -> {
              seen.add(toBeSigned);
              return inner.apply(toBeSigned);
            },
            Algorithm.RSA_PKCS1_SHA256,
            key("rsa2048.cert.pem")));

    assertEquals(1, seen.size());
    // A DER SET OF attributes (RFC 5652's explicit form, tag 0x31), not the
    // 32-byte SHA-256 digest.
    assertEquals((byte) 0x31, seen.get(0)[0]);
    assertNotEquals(32, seen.get(0).length);
  }

  @Test
  void aCertificateHeldInMemoryNeverHasToBeWrittenDown() throws Exception {
    ShojikuClient client = client().build();
    ExternalSigner provider =
        ExternalSigner.ofPem(
            signing("rsa2048", Algorithm.RSA_PKCS1_SHA256),
            Algorithm.RSA_PKCS1_SHA256,
            Files.readAllBytes(key("rsa2048.cert.pem")));

    assertTrue(client.sign(rendered(client), provider).success());
    assertTrue(provider.toString().contains("[pem bytes]"));
  }

  @Test
  void aSignatureWithNothingInItIsRefused() {
    ShojikuClient client = client().build();
    ExternalSigner provider =
        ExternalSigner.of(
            toBeSigned -> new byte[0], Algorithm.RSA_PKCS1_SHA256, key("rsa2048.cert.pem"));

    UsageException error =
        assertThrows(UsageException.class, () -> client.sign(rendered(client), provider));
    assertTrue(error.getMessage().contains("non-empty signature"));
  }

  @Test
  void aFunctionThatReturnsNothingAtAllIsRefusedToo() {
    // Null and empty are the same claim — there is no signature — and both
    // have to be refused rather than written into a document.
    ShojikuClient client = client().build();
    ExternalSigner provider =
        ExternalSigner.of(toBeSigned -> null, Algorithm.RSA_PKCS1_SHA256, key("rsa2048.cert.pem"));

    UsageException error =
        assertThrows(UsageException.class, () -> client.sign(rendered(client), provider));
    assertTrue(error.getMessage().contains("non-empty signature"));
  }

  @Test
  void theFunctionsOwnFailureIsNotFiledAsADocumentFailure() {
    // A key service outage is the caller's, not a fact about this document.
    ShojikuClient client = client().build();
    ExternalSigner provider =
        ExternalSigner.of(
            toBeSigned -> {
              throw new IllegalStateException("the key service is unreachable");
            },
            Algorithm.RSA_PKCS1_SHA256,
            key("rsa2048.cert.pem"));

    IllegalStateException error =
        assertThrows(IllegalStateException.class, () -> client.sign(rendered(client), provider));
    assertEquals("the key service is unreachable", error.getMessage());
  }

  @Test
  void noSignatureIsAskedForWhenPreparingFailed() {
    // An unreadable certificate is a fact about the inputs; paying for a
    // signature afterwards would tell the caller nothing new.
    AtomicBoolean asked = new AtomicBoolean();
    ShojikuClient client = client().build();
    ExternalSigner provider =
        ExternalSigner.of(
            toBeSigned -> {
              asked.set(true);
              return new byte[] {1};
            },
            Algorithm.RSA_PKCS1_SHA256,
            Path.of("/nonexistent/signer.crt"));

    Result<DocumentArtifact> result = client.sign(rendered(client), provider);

    assertTrue(result.failed());
    assertFalse(asked.get());
  }

  @Test
  void aRefusedDocumentComesBackAsAFailedResultWithNoSignatureAsked() {
    // The engine itself refuses: these bytes are not a document it rendered.
    AtomicBoolean asked = new AtomicBoolean();
    ShojikuClient client = client().build();
    ExternalSigner provider =
        ExternalSigner.of(
            toBeSigned -> {
              asked.set(true);
              return new byte[] {1};
            },
            Algorithm.RSA_PKCS1_SHA256,
            key("rsa2048.cert.pem"));

    Result<DocumentArtifact> result =
        client.sign(client.artifact("not a PDF".getBytes(StandardCharsets.UTF_8)), provider);

    assertTrue(result.failed());
    assertFalse(asked.get());
  }

  @Test
  void theCertificateAndTheFunctionAreTakenExplicitly() {
    UnaryOperator<byte[]> sign = bytes -> new byte[] {1};

    assertTrue(
        assertThrows(
                UsageException.class,
                () -> ExternalSigner.of(null, Algorithm.RSA_PKCS1_SHA256, key("rsa2048.cert.pem")))
            .getMessage()
            .contains("function that signs"));
    assertTrue(
        assertThrows(
                UsageException.class, () -> ExternalSigner.of(sign, null, key("rsa2048.cert.pem")))
            .getMessage()
            .contains("needs an algorithm"));
    assertTrue(
        assertThrows(
                UsageException.class,
                () -> ExternalSigner.of(sign, Algorithm.RSA_PKCS1_SHA256, null))
            .getMessage()
            .contains("needs either"));
    assertTrue(
        assertThrows(
                UsageException.class,
                () -> ExternalSigner.ofPem(sign, Algorithm.RSA_PKCS1_SHA256, null))
            .getMessage()
            .contains("needs either"));
  }

  @Test
  void aPayloadThatNamesNoBytesToSignIsRefused() {
    // The real engine always reports them, so this is the shape only a
    // different library on the other end could produce.
    assertTrue(
        assertThrows(UsageException.class, () -> ExternalSigner.bytesToSign("{}"))
            .getMessage()
            .contains("no bytes to sign"));
    assertTrue(
        assertThrows(UsageException.class, () -> ExternalSigner.bytesToSign("{\"toBeSigned\":7}"))
            .getMessage()
            .contains("no bytes to sign"));
    assertArrayEquals(
        "123".getBytes(StandardCharsets.UTF_8),
        ExternalSigner.bytesToSign("{\"toBeSigned\":\"MTIz\"}"));
  }

  @Test
  void thePrintedFormShowsTheCertificateFormAndTheAlgorithmOnly() throws Exception {
    String shown = external("ec256", Algorithm.ECDSA_P256_SHA256).toString();

    assertTrue(shown.contains("ec256.cert.pem"));
    assertTrue(shown.contains("ecdsa-p256-sha256"));
    assertEquals(
        Algorithm.ECDSA_P256_SHA256, external("ec256", Algorithm.ECDSA_P256_SHA256).algorithm());
    assertFalse(shown.contains("Lambda"));
  }

  @Test
  void aRegisteredExternalSignerSignsFromAStrictClient() throws Exception {
    // The provider a strict deployment may use is a NAMED one, and an external
    // signer is as nameable as a local key.
    ShojikuClient client = client().providers(Map.of("kms", external("rsa2048"))).build();

    assertTrue(client.sign(rendered(client), "kms").success());
  }

  @Test
  void aBareExternalSignerIsRefusedByAStrictClient() throws Exception {
    ShojikuClient strict =
        client().strict(true).providers(Map.of("kms", external("rsa2048"))).build();

    UsageException error =
        assertThrows(
            UsageException.class,
            () -> strict.sign(rendered(client().build()), external("rsa2048")));
    assertTrue(error.getMessage().contains("registered in configuration"));
  }

  @Test
  void aRegisteredValueThatCarriesNoMaterialIsRefused() {
    // The registry holds SigningProvider, a public marker: a value implementing
    // it and nothing else would otherwise reach the transport with no way to
    // produce a signature.
    SigningProvider marker = new SigningProvider() {};
    ShojikuClient client = client().providers(Map.of("kms", marker)).build();

    assertTrue(
        assertThrows(UsageException.class, () -> client.sign(rendered(client), "kms"))
            .getMessage()
            .contains("no signing provider named"));
  }

  private ExternalSigner external(String stem) throws IOException {
    return external(stem, Algorithm.RSA_PKCS1_SHA256);
  }

  private ExternalSigner external(String stem, Algorithm algorithm) throws IOException {
    return ExternalSigner.of(signing(stem, algorithm), algorithm, key(stem + ".cert.pem"));
  }

  /**
   * A stand-in for a key service: signs with a key this package never hands to the engine. The
   * output is the raw operation's, which is what both major cloud key services return.
   */
  private UnaryOperator<byte[]> signing(String stem, Algorithm algorithm) throws IOException {
    byte[] der = pkcs8(Files.readString(key(stem + ".key.pem")));
    String keyAlgorithm = algorithm == Algorithm.RSA_PKCS1_SHA256 ? "RSA" : "EC";
    String signatureAlgorithm =
        algorithm == Algorithm.RSA_PKCS1_SHA256 ? "SHA256withRSA" : "SHA256withECDSA";
    return toBeSigned -> {
      try {
        PrivateKey privateKey =
            KeyFactory.getInstance(keyAlgorithm).generatePrivate(new PKCS8EncodedKeySpec(der));
        Signature signature = Signature.getInstance(signatureAlgorithm);
        signature.initSign(privateKey);
        signature.update(toBeSigned);
        return signature.sign();
      } catch (Exception error) {
        throw new IllegalStateException("the stand-in key service failed", error);
      }
    };
  }

  private static byte[] pkcs8(String pem) {
    String body =
        pem.replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replaceAll("\\s", "");
    return Base64.getDecoder().decode(body);
  }
}
