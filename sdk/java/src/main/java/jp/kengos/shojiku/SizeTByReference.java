package jp.kengos.shojiku;

import com.sun.jna.Native;
import com.sun.jna.ptr.ByReference;

/**
 * An out-parameter of {@link SizeT} width.
 *
 * <p>Read at the width the C type actually has rather than at the language's convenient one. This
 * is the decode side of the silent-failure class {@link SizeT} describes: nothing crashes when the
 * width is wrong, the number is simply not the one the engine wrote.
 *
 * <p><b>Public only because JNA requires it</b>, exactly as {@link SizeT} is. Transport plumbing.
 */
public final class SizeTByReference extends ByReference {

  /** A slot the engine writes a length into. */
  public SizeTByReference() {
    super(Native.SIZE_T_SIZE);
  }

  /**
   * The length the engine wrote.
   *
   * @return the value, widened to a Java long
   */
  public long getValue() {
    return Native.SIZE_T_SIZE == 8 ? getPointer().getLong(0) : getPointer().getInt(0) & 0xFFFFFFFFL;
  }
}
