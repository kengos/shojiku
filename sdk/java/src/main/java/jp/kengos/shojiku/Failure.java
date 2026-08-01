package jp.kengos.shojiku;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Why a lifecycle operation did not produce what was asked for.
 *
 * <p>A VALUE, not an exception. The shape takes effect-ts's {@code Cause} as its conceptual
 * reference: which step failed, what class of thing went wrong, and — when one failure happened
 * because of another — the chain underneath it, all inspectable rather than unwound. No effect
 * framework is involved; only the idea that a failure is data.
 */
public final class Failure {

  private final Step step;
  private final String kind;
  private final String message;
  private final List<Diagnostic> diagnostics;
  private final Failure cause;

  Failure(Step step, String kind, String message, List<Diagnostic> diagnostics, Failure cause) {
    this.step = step;
    this.kind = kind;
    this.message = message;
    this.diagnostics = diagnostics == null ? List.of() : List.copyOf(diagnostics);
    this.cause = cause;
  }

  Failure(Step step, String kind, String message) {
    this(step, kind, message, null, null);
  }

  /** Reads a failure out of the engine's error payload. */
  static Failure fromErrorJson(
      String payload, Step step, List<Diagnostic> diagnostics, Failure cause) {
    Map<String, Object> parsed = Json.object(payload);
    Object kind = parsed.get("kind");
    Object message = parsed.get("message");
    return new Failure(
        step,
        kind instanceof String text ? text : "unknown",
        message instanceof String text ? text : "",
        diagnostics,
        cause);
  }

  /**
   * Which of this SDK's lifecycle steps refused — never the engine's internal stage.
   *
   * @return the step
   */
  public Step step() {
    return step;
  }

  /**
   * A stable machine-readable class.
   *
   * <p>Engine-side kinds come straight off the wire; host-side ones are this package's own ({@code
   * template_name}, {@code io}).
   *
   * @return the kind
   */
  public String kind() {
    return kind;
  }

  /**
   * What went wrong, in the engine's or this package's own words.
   *
   * @return the message
   */
  public String message() {
    return message;
  }

  /**
   * Whatever the engine noticed while refusing.
   *
   * @return the diagnostics
   */
  public List<Diagnostic> diagnostics() {
    return diagnostics;
  }

  /**
   * The failure underneath this one, when there is one.
   *
   * @return the cause, or null
   */
  public Failure cause() {
    return cause;
  }

  /**
   * This failure and everything under it, outermost first.
   *
   * <p>What you log when you want the whole story rather than only its headline.
   *
   * @return the chain
   */
  public List<Failure> causes() {
    List<Failure> chain = new ArrayList<>();
    for (Failure failure = this; failure != null; failure = failure.cause) {
      chain.add(failure);
    }
    return List.copyOf(chain);
  }

  @Override
  public String toString() {
    return step + "/" + kind + ": " + message;
  }
}
