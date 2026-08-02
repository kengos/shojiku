package jp.kengos.shojiku;

/**
 * Everything copied out of one result handle, before that handle is freed.
 *
 * <p>A snapshot rather than a wrapper, and that is the ownership rule of this binding in one word:
 * no Java object ever holds a pointer into engine memory. The accessors LEND — their pointers die
 * with the handle — so the bytes are copied while the handle is alive and the handle is freed on
 * the way out, on every path.
 *
 * @param status the C-level status; non-zero is caller error
 * @param success whether the operation produced what was asked for
 * @param pdf the rendered or signed bytes, empty when there are none
 * @param json the operation's payload
 * @param diagnostics the engine's diagnostics
 * @param error why it failed, empty on success
 */
record Snapshot(
    int status, boolean success, byte[] pdf, String json, String diagnostics, String error) {}
