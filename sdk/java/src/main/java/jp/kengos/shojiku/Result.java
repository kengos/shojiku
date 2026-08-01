package jp.kengos.shojiku;

import java.util.ArrayList;
import java.util.List;

/**
 * What every lifecycle operation returns.
 *
 * <p>Nothing in the normal flow throws. A template that will not render, a key that will not sign,
 * a signature that does not verify are all data you query — {@link #success()}, the value, the
 * engine's diagnostics either way, and on failure the {@link Failure} trace.
 *
 * <p>Diagnostics ride on a SUCCESS too. A render that worked can still have warned about an
 * overflowing box, and a caller that only looks at failures never sees them.
 *
 * @param <T> what the operation produced
 */
public final class Result<T> {

  private final T value;
  private final List<Diagnostic> diagnostics;
  private final Failure failure;

  Result(T value, List<Diagnostic> diagnostics, Failure failure) {
    this.value = value;
    this.diagnostics = diagnostics == null ? List.of() : List.copyOf(diagnostics);
    this.failure = failure;
  }

  static <T> Result<T> succeeded(T value, List<Diagnostic> diagnostics) {
    return new Result<>(value, diagnostics, null);
  }

  /**
   * A failed result, carrying the failure's own diagnostics.
   *
   * <p>Named {@code fromFailure} rather than mirroring ruby's {@code Result.failed}, because a
   * static factory and a predicate cannot share one name here and the PREDICATE is the one the
   * frozen contract lists.
   */
  static <T> Result<T> fromFailure(Failure failure) {
    return new Result<>(null, failure.diagnostics(), failure);
  }

  /**
   * What the operation produced, if it produced anything.
   *
   * @return the value, or null
   */
  public T value() {
    return value;
  }

  /**
   * {@link #value()} under the name of what a render or a signature produced.
   *
   * <p>The same object; the alias exists so calling code reads as what it is doing.
   *
   * @return the value, or null
   */
  public T artifact() {
    return value;
  }

  /**
   * {@link #value()} under the name of what a verification produced.
   *
   * @return the value, or null
   */
  public T report() {
    return value;
  }

  /**
   * Everything the engine noticed — on a successful operation as well as a failed one.
   *
   * @return the diagnostics
   */
  public List<Diagnostic> diagnostics() {
    return diagnostics;
  }

  /**
   * Why the operation did not produce what was asked for.
   *
   * @return the trace, or null on success
   */
  public Failure failure() {
    return failure;
  }

  /**
   * Whether the operation produced what was asked for.
   *
   * @return true when it did
   */
  public boolean success() {
    return failure == null;
  }

  /**
   * Whether the operation did not.
   *
   * @return true when it did not
   */
  public boolean failed() {
    return !success();
  }

  /**
   * Only the diagnostics that are errors — the ones that explain a refusal.
   *
   * @return the errors
   */
  public List<Diagnostic> errors() {
    return filter(true);
  }

  /**
   * Only the warnings, which a SUCCESSFUL result can carry.
   *
   * @return the warnings
   */
  public List<Diagnostic> warnings() {
    return filter(false);
  }

  /**
   * The value, or a thrown {@link UnwrapException}.
   *
   * <p>The opt-in bridge for a script that wants a stack trace rather than a branch, and the ONE
   * place this API throws for something other than a misused argument. That is why the ruling is
   * stated rather than implied, and frozen for every Shojiku SDK: <b>calling unwrap on a failed
   * result is programmer misuse</b> — a caller who has not checked {@link #success()} is asserting
   * the operation worked. Application code that handles failure keeps using {@link #success()} and
   * {@link #failure()}; nothing in this package calls it.
   *
   * <p>(Go is the recorded exception to the throwing form: with no exceptions in the language its
   * SDK mirrors the shape as an error return.)
   *
   * @return the value, which is null for the one success that carries none — a verify whose payload
   *     was empty
   */
  public T unwrap() {
    if (failure != null) {
      throw new UnwrapException(failure);
    }
    return value;
  }

  private List<Diagnostic> filter(boolean wantErrors) {
    List<Diagnostic> kept = new ArrayList<>();
    for (Diagnostic item : diagnostics) {
      if (wantErrors ? item.isError() : item.isWarning()) {
        kept.add(item);
      }
    }
    return List.copyOf(kept);
  }
}
