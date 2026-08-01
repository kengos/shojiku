package jp.kengos.shojiku;

/**
 * A refused name or an unreadable template.
 *
 * <p>Rejection is an exception INSIDE the resolver and a failed result outside it — a hostile
 * template name is a fact about the request, not a bug in the calling program.
 */
final class RejectedException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final String kind;
  private final String causeMessage;

  RejectedException(String kind, String message) {
    this(kind, message, null);
  }

  RejectedException(String kind, String message, String causeMessage) {
    super(message);
    this.kind = kind;
    this.causeMessage = causeMessage;
  }

  String kind() {
    return kind;
  }

  String causeMessage() {
    return causeMessage;
  }
}
