package jp.kengos.shojiku;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The one place this package reads the environment.
 *
 * <p>A client is built with {@code env(true)} (the default) or {@code env(false)}, and that single
 * flag governs EVERY {@code SHOJIKU_*} lookup — the template root, the font and locale directories,
 * and the library path. One flag rather than one per variable is the reference decision the other
 * six SDKs mirror: an application that wants a hermetic configuration wants all of it off, and a
 * per-variable set of knobs is a shape nobody can keep consistent across seven languages.
 *
 * <p>Disabled lookups behave exactly as unset variables do, so calling code has no second branch to
 * get wrong.
 */
final class Env {

  private final boolean enabled;
  private final Map<String, String> source;

  Env(boolean enabled) {
    this(enabled, null);
  }

  Env(boolean enabled, Map<String, String> source) {
    this.enabled = enabled;
    this.source = source;
  }

  /** The variable's value, or null when unset, blank, or lookups are off. */
  String get(String name) {
    if (!enabled) {
      return null;
    }
    String value = source == null ? System.getenv(name) : source.get(name);
    return value == null || value.isEmpty() ? null : value;
  }

  /**
   * A path-separator-separated variable as a list of directories.
   *
   * <p>Which is how every other tool in this family spells "several paths in one variable".
   */
  List<String> paths(String name) {
    String value = get(name);
    if (value == null) {
      return List.of();
    }
    List<String> listed = new ArrayList<>();
    for (String entry : value.split(java.util.regex.Pattern.quote(File.pathSeparator), -1)) {
      if (!entry.isEmpty()) {
        listed.add(entry);
      }
    }
    return List.copyOf(listed);
  }
}
