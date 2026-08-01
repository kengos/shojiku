package jp.kengos.shojiku;

/** What a client needs from anything it can sign with. */
public interface SigningProvider {

  /**
   * The private key, as PEM or DER bytes.
   *
   * @return the key material
   */
  byte[] key();

  /**
   * The signing certificate, as PEM or DER bytes.
   *
   * @return the certificate material
   */
  byte[] certificate();

  /**
   * The key's passphrase, when it has one.
   *
   * @return the passphrase, or null
   */
  byte[] passphrase();
}
