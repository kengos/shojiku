package jp.kengos.shojiku;

/** How a key signs, in the spelling the engine accepts. */
public enum Algorithm {

  /** RSA PKCS#1 v1.5 over SHA-256; the signature is the raw operation output. */
  RSA_PKCS1_SHA256("rsa-pkcs1-sha256"),

  /**
   * ECDSA on P-256 over SHA-256; the signature is an ASN.1 DER SEQUENCE, which is what both major
   * cloud key services return.
   */
  ECDSA_P256_SHA256("ecdsa-p256-sha256");

  private final String wire;

  Algorithm(String wire) {
    this.wire = wire;
  }

  /**
   * The spelling the engine accepts.
   *
   * @return the wire name
   */
  public String wire() {
    return wire;
  }
}
