package jp.kengos.shojiku;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Shared helpers every echoing and material-reading path owes. */
final class Texts {

  /** How much caller-supplied text may reach a message or a log line. */
  static final int ECHO_LIMIT = 80;

  private Texts() {}

  /**
   * Echo caller-supplied text back, stripped and capped.
   *
   * <p>Template names and provider names reach exception reporters and log files, so they are
   * stripped of control characters and bounded before they are quoted — the same discipline the
   * engine applies to the values it echoes. One place for it, because every path that echoes owes
   * the same thing.
   */
  static String bounded(String value) {
    if (value == null || value.isEmpty()) {
      return "";
    }
    StringBuilder stripped = new StringBuilder(value.length());
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      if (!Character.isISOControl(character)) {
        stripped.append(character);
      }
    }
    String text = stripped.toString();
    return text.length() <= ECHO_LIMIT ? text : text.substring(0, ECHO_LIMIT);
  }

  /**
   * Read the byte inputs signing and verification take.
   *
   * <p>One place, because both paths owe the same thing: raw bytes (PEM is bytes, and a transcode
   * would corrupt a DER-bearing file), and an unreadable file surfacing as {@link
   * MaterialUnreadableException} rather than as a raw {@link IOException} nobody upstream is
   * catching.
   */
  static byte[] readMaterial(Path path, String kind) {
    try {
      return Files.readAllBytes(path);
    } catch (IOException | RuntimeException error) {
      throw new MaterialUnreadableException(kind, String.valueOf(error.getMessage()));
    }
  }
}
