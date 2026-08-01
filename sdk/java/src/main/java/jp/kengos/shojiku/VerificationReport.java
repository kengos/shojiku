package jp.kengos.shojiku;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What verification found — INCLUDING what it did not look at.
 *
 * <p>{@link #notChecked()} is a field, not a footnote, and this binding passes it through
 * untouched. A "valid" verdict that quietly skipped revocation is worse than no verifier at all: it
 * turns a missing capability into a false assurance, which is exactly the trust a signing feature
 * sells. Dropping it on the way through an SDK would be the same lie one layer up.
 *
 * <p>The four checks stay separate for the same reason. "The signature is valid but covers only
 * part of the file" is a different fact from "the signature is wrong", and a caller that cannot
 * tell them apart cannot explain the answer to anyone.
 */
public final class VerificationReport {

  private final boolean valid;
  private final Check signature;
  private final Check coverage;
  private final Check certificateValidity;
  private final Check trustChain;
  private final List<String> notChecked;

  VerificationReport(Map<String, Object> payload) {
    this.valid = Boolean.TRUE.equals(payload.get("valid"));
    this.signature = new Check(payload.get("signature"));
    this.coverage = new Check(payload.get("coverage"));
    this.certificateValidity = new Check(payload.get("certificateValidity"));
    this.trustChain = new Check(payload.get("trustChain"));

    List<String> listed = new ArrayList<>();
    if (payload.get("notChecked") instanceof List<?> items) {
      for (Object item : items) {
        if (item instanceof String text) {
          listed.add(text);
        }
      }
    }
    this.notChecked = List.copyOf(listed);
  }

  static VerificationReport parse(String payload) {
    return new VerificationReport(Json.object(payload));
  }

  /**
   * Whether every check this release PERFORMS passed.
   *
   * <p>Read {@link #notChecked()} beside it: this is not "the document is trustworthy", it is
   * "nothing we looked at was wrong".
   *
   * @return the verdict
   */
  public boolean valid() {
    return valid;
  }

  /**
   * Whether the signature itself verified over the bytes it covers.
   *
   * @return the check
   */
  public Check signature() {
    return signature;
  }

  /**
   * Whether the signature covers the whole file — an incomplete range is a forgery, not a detail.
   *
   * @return the check
   */
  public Check coverage() {
    return coverage;
  }

  /**
   * Whether the signing certificate was within its validity window.
   *
   * @return the check
   */
  public Check certificateValidity() {
    return certificateValidity;
  }

  /**
   * Whether the certificate chained to a caller-supplied anchor.
   *
   * @return the check
   */
  public Check trustChain() {
    return trustChain;
  }

  /**
   * What this release did NOT look at.
   *
   * @return the names of the checks that were never performed
   */
  public List<String> notChecked() {
    return notChecked;
  }

  /**
   * The four checks, by name.
   *
   * @return the checks, keyed by this SDK's own accessor names
   */
  public Map<String, Check> checks() {
    Map<String, Check> checks = new LinkedHashMap<>();
    checks.put("signature", signature);
    checks.put("coverage", coverage);
    checks.put("certificateValidity", certificateValidity);
    checks.put("trustChain", trustChain);
    return Map.copyOf(checks);
  }
}
