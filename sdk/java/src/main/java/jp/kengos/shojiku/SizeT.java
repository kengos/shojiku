package jp.kengos.shojiku;

import com.sun.jna.IntegerType;
import com.sun.jna.Native;

/**
 * The C {@code size_t}, at whatever width this platform has.
 *
 * <p>Not a {@code long}: they agree on every platform in this SDK's matrix and stop agreeing the
 * moment one does not, and an out-parameter decoded at the wrong width fails SILENTLY — the
 * reference SDK once read every success flag as false while the string buffers beside it decoded
 * perfectly.
 *
 * <p><b>Public only because JNA requires it.</b> JNA instantiates argument and return types
 * reflectively from its own package, so this class and its no-argument constructor have to be
 * reachable from outside this one. It is transport plumbing, not part of the lifecycle surface: an
 * application never constructs one.
 */
public final class SizeT extends IntegerType {

  private static final long serialVersionUID = 1L;

  /** Zero. Required by JNA, which instantiates this type reflectively. */
  public SizeT() {
    this(0);
  }

  /**
   * A length, at this platform's {@code size_t} width.
   *
   * @param value the length
   */
  public SizeT(long value) {
    super(Native.SIZE_T_SIZE, value, true);
  }
}
