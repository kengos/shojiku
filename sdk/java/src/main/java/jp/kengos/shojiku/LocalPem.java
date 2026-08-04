package jp.kengos.shojiku;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

/**
 * A signing provider backed by a PEM key and certificate.
 *
 * <p>The only provider this release has. KMS and HSM providers are a recorded deferral, which is
 * why this is a named class rather than a pair of arguments on {@code sign} — a second provider
 * then adds a class, not a signature change in seven languages.
 *
 * <p>The material comes either from paths or from bytes already in memory, so a key fetched from a
 * secret manager never has to be written to disk first. Which one you passed is explicit rather
 * than sniffed: guessing whether a string is a path or a PEM body is exactly the kind of cleverness
 * that reads the wrong file. Java's types make that explicit at the call site — a {@link Path} is a
 * path and a {@code byte[]} is material — and the builder still refuses BOTH forms of the same
 * half.
 *
 * <p>Nothing here logs key material, and the engine builds its refusals from fixed strings, so a
 * rejection cannot echo it back either.
 */
public final class LocalPem implements EngineSigner {

  private final Path keyPath;
  private final Path certPath;
  private final byte[] passphrase;
  private byte[] keyPem;
  private byte[] certPem;

  private LocalPem(Builder builder) {
    this.keyPath = builder.keyPath;
    this.certPath = builder.certPath;
    this.keyPem = builder.keyPem;
    this.certPem = builder.certPem;
    this.passphrase = builder.passphrase;
    oneSource(builder.keyPath, builder.keyPem, "key");
    oneSource(builder.certPath, builder.certPem, "cert");
  }

  /**
   * The common case: both halves as files on disk.
   *
   * @param key path to the private key
   * @param cert path to the certificate
   */
  public LocalPem(Path key, Path cert) {
    this(builder().key(key).cert(cert));
  }

  /**
   * A builder, for the mixed and in-memory forms.
   *
   * @return a new builder
   */
  public static Builder builder() {
    return new Builder();
  }

  /**
   * The private key, as PEM or DER bytes.
   *
   * @return the key material
   */
  public byte[] key() {
    if (keyPem == null) {
      keyPem = Texts.readMaterial(keyPath, "key_unreadable");
    }
    return keyPem;
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
   * The key's passphrase, when it has one.
   *
   * @return the passphrase, or null
   */
  public byte[] passphrase() {
    return passphrase;
  }

  /**
   * Redacted, deliberately.
   *
   * <p>The default {@code toString} would be a class name and a hash, but a debugger's display, a
   * structured logger or any message that interpolates the provider reaches for the members — which
   * here are the private key and the passphrase. So this states what is safe and nothing else: the
   * class, and which FORM each half came from. Registering the provider once shrinks the surface
   * further: material loads into one object instead of being rebuilt per request.
   *
   * @return the redacted form
   */
  @Override
  public Snapshot signWith(Engine engine, byte[] pdf) {
    return engine.sign(pdf, key(), certificate(), passphrase());
  }

  @Override
  public String toString() {
    return "<LocalPem key="
        + form(keyPath)
        + " cert="
        + form(certPath)
        + " passphrase="
        + (passphrase == null ? "none" : "[redacted]")
        + ">";
  }

  /**
   * The path, or a note that the bytes came from memory.
   *
   * <p>A configured file path is not secret and is the one thing worth seeing when a provider
   * loaded the wrong material; the bytes themselves are never printed.
   */
  private static String form(Path path) {
    return path == null ? "[pem bytes]" : path.toString();
  }

  /**
   * Explicit, never sniffed — in BOTH directions.
   *
   * <p>Accepting both forms and silently preferring one ignores the argument the caller meant, on
   * the path where reading the wrong key matters most.
   */
  private static void oneSource(Path path, byte[] pem, String what) {
    String forms = "`" + what + "` (a path) or `" + what + "Pem` (bytes)";
    if (path != null && pem != null) {
      throw new UsageException("LocalPem takes either " + forms + ", not both");
    }
    if (path == null && pem == null) {
      throw new UsageException("LocalPem needs either " + forms);
    }
  }

  /** Builds a {@link LocalPem} from any one form of each half. */
  public static final class Builder {
    private Path keyPath;
    private Path certPath;
    private byte[] keyPem;
    private byte[] certPem;
    private byte[] passphrase;

    private Builder() {}

    /**
     * The private key, as a file.
     *
     * @param path where the key is
     * @return this builder
     */
    public Builder key(Path path) {
      this.keyPath = path;
      return this;
    }

    /**
     * The certificate, as a file.
     *
     * @param path where the certificate is
     * @return this builder
     */
    public Builder cert(Path path) {
      this.certPath = path;
      return this;
    }

    /**
     * The private key, as bytes already in memory.
     *
     * @param pem the key material
     * @return this builder
     */
    public Builder keyPem(byte[] pem) {
      this.keyPem = pem == null ? null : pem.clone();
      return this;
    }

    /**
     * The certificate, as bytes already in memory.
     *
     * @param pem the certificate material
     * @return this builder
     */
    public Builder certPem(byte[] pem) {
      this.certPem = pem == null ? null : pem.clone();
      return this;
    }

    /**
     * The key's passphrase, when it has one.
     *
     * @param value the passphrase
     * @return this builder
     */
    public Builder passphrase(byte[] value) {
      this.passphrase = value == null ? null : value.clone();
      return this;
    }

    /**
     * The key's passphrase as text, encoded UTF-8.
     *
     * @param value the passphrase
     * @return this builder
     */
    public Builder passphrase(String value) {
      return passphrase(value == null ? null : value.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Builds the provider, refusing both forms of either half.
     *
     * @return the provider
     */
    public LocalPem build() {
      return new LocalPem(this);
    }
  }
}
