package jp.kengos.shojiku;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * A rendered (and possibly signed) document.
 *
 * <p>The application sees bytes and metadata — never a layout-engine internal, and never a handle
 * it has to free. Freeing is the binding's job and it is already done by the time this object
 * exists.
 */
public final class DocumentArtifact {

  private final byte[] bytes;
  private final Integer pageCount;
  private final List<Diagnostic> diagnostics;
  private final Origin origin;
  private final ShojikuClient client;

  DocumentArtifact(
      byte[] bytes,
      List<Diagnostic> diagnostics,
      ShojikuClient client,
      Integer pageCount,
      Origin origin) {
    this.bytes = bytes;
    this.diagnostics = diagnostics == null ? List.of() : List.copyOf(diagnostics);
    this.client = client;
    this.pageCount = pageCount;
    this.origin = origin;
  }

  /**
   * The PDF, as binary.
   *
   * <p>A copy: PDF bytes are not text, and an application that mutates what it was handed must not
   * be able to change what another holder sees.
   *
   * @return the document
   */
  public byte[] bytes() {
    return bytes.clone();
  }

  /**
   * How many pages the engine laid out.
   *
   * <p>Null for an artifact that was signed rather than rendered — signing appends a revision to
   * bytes it never measured, and a zero there would read as "a document with no pages".
   *
   * @return the page count, or null
   */
  public Integer pageCount() {
    return pageCount;
  }

  /**
   * Whatever the engine noticed while producing these bytes.
   *
   * @return the diagnostics
   */
  public List<Diagnostic> diagnostics() {
    return diagnostics;
  }

  /**
   * Where these bytes came from.
   *
   * @return the origin
   */
  public Origin origin() {
    return origin;
  }

  /**
   * Whether these bytes were handed over whole rather than laid out here.
   *
   * @return true when they were
   */
  public boolean loaded() {
    return origin == Origin.LOADED;
  }

  /**
   * How many bytes the document is.
   *
   * @return the size
   */
  public int size() {
    return bytes.length;
  }

  /**
   * Write the document.
   *
   * <p>Binary, explicitly — a PDF contains NUL and every other byte value, and a text write would
   * translate line endings on Windows.
   *
   * @param path where to write it
   * @return the path written to
   * @throws IOException when the write fails, which is the caller's own filesystem problem rather
   *     than anything about the document
   */
  public Path write(Path path) throws IOException {
    Files.write(path, bytes);
    return path;
  }

  /**
   * Sign this document, returning a result carrying the signed artifact.
   *
   * <p>The signed bytes begin with these bytes byte for byte: signing appends a revision, it never
   * rewrites what was there.
   *
   * @param provider a provider object, or the name of one registered in configuration
   * @return the signed document, or the failure
   */
  public Result<DocumentArtifact> sign(Object provider) {
    return client.sign(this, provider);
  }

  /**
   * Verify this document against trust anchors given as files.
   *
   * @param anchors paths to PEM trust anchors
   * @return the report, on a passing verdict and a failing one alike
   */
  public Result<VerificationReport> verify(List<Path> anchors) {
    return client.verify(this, anchors, null);
  }

  /**
   * Verify this document against trust anchors given as PEM bytes.
   *
   * @param anchorsPem the anchors, possibly several concatenated
   * @return the report, on a passing verdict and a failing one alike
   */
  public Result<VerificationReport> verifyPem(byte[] anchorsPem) {
    return client.verify(this, null, anchorsPem);
  }

  /** The bytes themselves, without the defensive copy — for this package's own calls. */
  byte[] raw() {
    return bytes;
  }
}
