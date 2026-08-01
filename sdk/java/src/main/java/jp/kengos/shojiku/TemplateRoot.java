package jp.kengos.shojiku;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Resolving a template NAME to the sources behind it.
 *
 * <p>A name is an identifier, never a path. A bundle format will take this lookup over later, so
 * nothing outside this class may assume a directory is how names resolve — callers ask for {@code
 * "receipt_ja"} and get sources back.
 *
 * <p>THE REJECTION RULES ARE THE UNION ACROSS PLATFORMS, NOT THE HOST'S. Windows is a first-class
 * target, so a backslash is a separator, {@code C:name} is drive-relative, {@code \\host\share} is
 * a UNC path and CON/NUL are reserved devices — every one of them refused on EVERY platform. A
 * template name that is valid on one machine is valid on all of them, which is the only way the
 * same application deploys to both.
 */
final class TemplateRoot {

  static final String TEMPLATE_FILE = "templates.yml";
  static final String DEFINITIONS_FILE = "definitions.yml";

  /**
   * Reserved DOS device names.
   *
   * <p>Windows resolves these no matter what directory you are in and no matter what extension you
   * append.
   */
  private static final Set<String> DEVICES = buildDevices();

  // A name is ONE segment. Refusing both separators outright subsumes traversal,
  // absolute paths and nested lookups in a single rule — the simplest thing six
  // other SDKs can mirror without drifting.
  private static final Pattern SEPARATORS = Pattern.compile("[/\\\\]");
  private static final Pattern DRIVE_RELATIVE = Pattern.compile("\\A[A-Za-z]:");
  private static final Pattern TRAILING_DOTS_AND_SPACES = Pattern.compile("[.\\s]+\\z");

  /** Each rule, and what a caller is told when it fires. */
  private static final List<Rule> RULES =
      List.of(
          new Rule(
              TemplateRoot::isSeparator,
              "a name is one segment, so `/` and `\\` are never part of it "
                  + "(which is also what makes `..` traversal impossible)"),
          new Rule(TemplateRoot::isControl, "it contains a control character"),
          new Rule(
              TemplateRoot::isDriveRelative,
              "it is drive-relative, which Windows resolves against that drive's current directory"),
          new Rule(TemplateRoot::isDevice, "it is a reserved device name on Windows"));

  private final String path;

  TemplateRoot(String path) {
    this.path = path;
  }

  String path() {
    return path;
  }

  /** Resolve {@code name}, or throw {@link RejectedException} naming why it will not. */
  Sources resolve(String name) {
    reject(name);
    Path real = contained(Paths.get(path, name));
    return new Sources(
        read(real.resolve(TEMPLATE_FILE)),
        optional(real.resolve(DEFINITIONS_FILE)),
        real.toString());
  }

  private static Set<String> buildDevices() {
    Set<String> devices = new java.util.HashSet<>(Set.of("CON", "PRN", "AUX", "NUL"));
    for (int n = 1; n <= 9; n++) {
      devices.add("COM" + n);
      devices.add("LPT" + n);
    }
    return Set.copyOf(devices);
  }

  private static boolean isSeparator(String name) {
    return SEPARATORS.matcher(name).find();
  }

  private static boolean isControl(String name) {
    return name.chars().anyMatch(Character::isISOControl);
  }

  private static boolean isDriveRelative(String name) {
    return DRIVE_RELATIVE.matcher(name).find();
  }

  /**
   * Trailing dots and spaces are STRIPPED by Windows before it resolves a name.
   *
   * <p>So {@code CON.} and {@code "CON "} are the CON device just as {@code CON} is. Without that
   * strip they slip past this rule and are refused later, by containment — still refused, but with
   * a message about a missing template rather than about a reserved name.
   */
  private static boolean isDevice(String name) {
    String stem = TRAILING_DOTS_AND_SPACES.matcher(name.split("\\.", -1)[0]).replaceAll("");
    return DEVICES.contains(stem.toUpperCase(Locale.ROOT));
  }

  private static void reject(String name) {
    if (name == null || name.isBlank()) {
      throw new RejectedException("template_name", "a template name must not be empty");
    }
    for (Rule rule : RULES) {
      if (rule.fires().test(name)) {
        throw new RejectedException(
            "template_name",
            "`" + Texts.bounded(name) + "` is not a template name: " + rule.explanation());
      }
    }
  }

  /**
   * The check a name-shape rule cannot make.
   *
   * <p>After following whatever the filesystem has there, is the answer still inside the root? A
   * symlink is what this exists for — it passes every rule above and still points out.
   *
   * <p>The existence check is explicit, so a missing template is named as one rather than falling
   * through to a confusing read error. And the containment test is STRUCTURAL rather than a string
   * prefix compare, which a sibling directory named {@code root-evil} would beat.
   */
  private Path contained(Path directory) {
    Path root;
    Path real;
    try {
      root = Paths.get(path).toRealPath();
      real = directory.toRealPath();
    } catch (IOException | RuntimeException error) {
      throw new RejectedException(
          "template_not_found", "no template by that name", String.valueOf(error.getMessage()));
    }

    if (real.equals(root) || isUnder(real, root)) {
      return real;
    }
    throw new RejectedException(
        "template_escapes_root", "the template resolves outside the template root");
  }

  private static boolean isUnder(Path real, Path root) {
    for (Path parent = real.getParent(); parent != null; parent = parent.getParent()) {
      if (parent.equals(root)) {
        return true;
      }
    }
    return false;
  }

  private static String read(Path file) {
    try {
      return Files.readString(file, StandardCharsets.UTF_8);
    } catch (IOException | RuntimeException error) {
      throw new RejectedException(
          "template_unreadable",
          "the template could not be read",
          String.valueOf(error.getMessage()));
    }
  }

  private static String optional(Path file) {
    return Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.isRegularFile(file)
        ? read(file)
        : null;
  }

  private record Rule(Predicate<String> fires, String explanation) {}
}
