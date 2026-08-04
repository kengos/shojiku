package jp.kengos.shojiku;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.function.UnaryOperator;

/**
 * A signing provider for a key this process is never given.
 *
 * <p>The second provider, and the shape {@link LocalPem}'s own comment promised: a new class rather
 * than new arguments on {@code sign}, so the call site is unchanged in all seven SDKs.
 *
 * <p>The engine hands out the bytes a signature has to cover; the function signs them wherever the
 * key actually lives — AWS KMS, Google Cloud KMS, an HSM, a smartcard, another service entirely —
 * and hands the signature back:
 *
 * <pre>{@code
 * var provider = ExternalSigner.of(
 *     toBeSigned -> kms.asymmetricSign(keyName, Digest.newBuilder()...).getSignature().toByteArray(),
 *     Algorithm.ECDSA_P256_SHA256,
 *     Path.of("signer.crt"));
 * client.sign(artifact, provider);
 * }</pre>
 *
 * <p>Shojiku ships no cloud client of its own, deliberately: the function is whatever client your
 * application already has, and the SDK stays a wrapper with nothing to keep in step with a vendor's
 * releases.
 *
 * <p><b>What the function receives is the signed ATTRIBUTES, not the document digest.</b> A service
 * that signs a digest must hash these bytes with SHA-256 itself. Signing the document digest
 * instead produces a document that fails verification, so the distinction is not cosmetic.
 *
 * <p>Nothing here is key material — that is the point of this provider — but the function closes
 * over whatever built it, which in practice is a client holding credentials. So {@link #toString}
 * states the certificate's FORM and the algorithm and nothing else, exactly as {@link LocalPem}
 * does.
 */
public final class ExternalSigner implements EngineSigner {

  private final UnaryOperator<byte[]> sign;
  private final Algorithm algorithm;
  private final Path certPath;
  private byte[] certPem;

  private ExternalSigner(
      UnaryOperator<byte[]> sign, Algorithm algorithm, Path certPath, byte[] certPem) {
    if (sign == null) {
      throw new UsageException("ExternalSigner needs a function that signs the bytes it is given");
    }
    if (algorithm == null) {
      throw new UsageException("ExternalSigner needs an algorithm");
    }
    requireCertificate(certPath, certPem);
    this.sign = sign;
    this.algorithm = algorithm;
    this.certPath = certPath;
    this.certPem = certPem;
  }

  /**
   * A provider whose certificate is read from a path.
   *
   * @param sign receives the bytes to sign, returns the raw signature
   * @param algorithm which algorithm the key signs with
   * @param cert path to the signer's certificate, as PEM
   * @return the provider
   */
  public static ExternalSigner of(UnaryOperator<byte[]> sign, Algorithm algorithm, Path cert) {
    return new ExternalSigner(sign, algorithm, cert, null);
  }

  /**
   * A provider whose certificate is already in memory, so it never has to be written to disk.
   *
   * @param sign receives the bytes to sign, returns the raw signature
   * @param algorithm which algorithm the key signs with
   * @param certPem the certificate as bytes
   * @return the provider
   */
  public static ExternalSigner ofPem(
      UnaryOperator<byte[]> sign, Algorithm algorithm, byte[] certPem) {
    return new ExternalSigner(sign, algorithm, null, certPem);
  }

  /**
   * The algorithm this provider's key signs with.
   *
   * @return the algorithm
   */
  public Algorithm algorithm() {
    return algorithm;
  }

  /**
   * The signing certificate, as PEM or DER bytes.
   *
   * @return the certificate material
   */
  public byte[] certificate() {
    if (certPem == null) {
      certPem = Texts.readMaterial(certPath, "certificate_unreadable");
    }
    return certPem;
  }

  /**
   * Signs in two engine calls, with the caller's function in between.
   *
   * <p>Both calls take the same document, certificate and algorithm: the pair is stateless, so the
   * second re-derives what the first prepared. Keeping them inside ONE method is what makes that
   * impossible to get wrong from Java — there is no way to pair a prepare of one document with a
   * complete of another.
   *
   * <p>A prepare that did not succeed is returned as it is: an unreadable certificate or a document
   * the engine refuses is a fact about the inputs, and paying for a signature afterwards would tell
   * the caller nothing new.
   */
  @Override
  public Snapshot signWith(Engine engine, byte[] pdf) {
    byte[] certificate = certificate();
    byte[] wire = algorithm.wire().getBytes(StandardCharsets.UTF_8);
    Snapshot prepared = engine.signPrepare(pdf, certificate, wire);
    if (prepared.status() != 0 || !prepared.success()) {
      return prepared;
    }
    return engine.signComplete(pdf, certificate, wire, signatureFor(prepared));
  }

  /**
   * The bytes the engine wants signed, out of the prepare payload.
   *
   * <p>A method of its own so the refusal is reachable from a test: the real engine always reports
   * {@code toBeSigned}, so a payload without one is a shape only a different library on the other
   * end could produce — and a guard nobody can exercise is a guard nobody knows works.
   *
   * @param json the prepare payload
   * @return the bytes to sign
   */
  static byte[] bytesToSign(String json) {
    // `Json.object` answers an empty map rather than null for anything that is
    // not an object, so the one check below covers every shape at once.
    Object encoded = Json.object(json).get("toBeSigned");
    if (!(encoded instanceof String text)) {
      throw new UsageException("the engine reported no bytes to sign");
    }
    return Base64.getDecoder().decode(text);
  }

  /**
   * Runs the function over the bytes the engine wants signed.
   *
   * <p>The function's own exceptions are deliberately not caught: it is the caller's code talking
   * to the caller's key service, and turning its failures into a failed result would file a
   * caller's outage under "something was wrong with this document".
   */
  private byte[] signatureFor(Snapshot prepared) {
    byte[] signature = sign.apply(bytesToSign(prepared.json()));
    if (signature == null || signature.length == 0) {
      throw new UsageException("the signing function must return a non-empty signature");
    }
    return signature;
  }

  /** Redacted, deliberately — see the class javadoc. */
  @Override
  public String toString() {
    String form = certPath == null ? "[pem bytes]" : certPath.toString();
    return "<ExternalSigner cert=" + form + " algorithm=" + algorithm.wire() + ">";
  }

  /**
   * Explicit, never sniffed — {@link LocalPem}'s rule, half of which Java gets for free.
   *
   * <p>{@link LocalPem} refuses "both forms at once" at run time because its constructor takes
   * both. Here the two FACTORIES make that unrepresentable: a caller reaches {@link #of} or {@link
   * #ofPem} and cannot name both, so the only thing left to check is that one of them carried
   * something.
   */
  private static void requireCertificate(Path path, byte[] pem) {
    if (path == null && pem == null) {
      throw new UsageException(
          "ExternalSigner needs either a certificate path or certificate bytes");
    }
  }
}
