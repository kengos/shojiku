package jp.kengos.shojiku;

import java.util.List;
import java.util.function.Supplier;

/**
 * One client's resolved configuration, plus the collaborators built from it.
 *
 * <p>{@link Configuration} answers "what was configured"; this answers "what does THIS client use",
 * which is the merge of the process-wide defaults with the arguments the client was built with.
 * Keeping it out of the client keeps the precedence rules in one readable place instead of spread
 * across a builder.
 *
 * <p>Everything is built lazily and memoized: a text-first application never configures a template
 * root, and demanding one at construction would refuse a legitimate client.
 */
final class Settings {

  private final Config config;
  private final Supplier<Env> env;
  private final Supplier<Log> log;
  private final Supplier<Lockdown> lockdown;
  private final Supplier<EngineLibrary> library;
  private final Supplier<List<String>> fontDirs;
  private final Supplier<List<String>> localeDirs;
  private final Supplier<TemplateRoot> templateRoot;

  Settings(Config overrides) {
    this.config = Configuration.current().merge(overrides);
    this.env = memoize(() -> new Env(config.envEnabled()));
    this.log = memoize(() -> new Log(config.logger()));
    this.lockdown = memoize(() -> new Lockdown(config.isStrict(), config.providers()));
    this.library = memoize(() -> new EngineLibrary(config.library(), env(), log()));
    this.fontDirs =
        memoize(
            () -> config.fontDirs() != null ? config.fontDirs() : env().paths("SHOJIKU_FONT_DIR"));
    this.localeDirs =
        memoize(
            () ->
                config.localeDirs() != null
                    ? config.localeDirs()
                    : env().paths("SHOJIKU_LOCALE_DIR"));
    this.templateRoot =
        memoize(
            () -> {
              String root = resolveRoot(config.templates(), env());
              return root == null ? null : new TemplateRoot(root);
            });
  }

  /**
   * Explicit configuration BEATS the environment for the template root.
   *
   * <p>The deliberate reverse of how the engine LIBRARY resolves: what an application renders is
   * the application's own decision, while where the engine lives is the deployment's.
   *
   * <p>Separated from the client so all three positions can be exercised — a Java process cannot
   * set a variable in its own environment, so a test that went through a built client could only
   * ever prove the explicit half. Same reason the ABI refusal and the packaged-directory lookup are
   * split out: a rule nobody can exercise is a rule nobody knows works.
   *
   * @param configured the explicit template root, or null
   * @param env this client's environment reader, which {@code env(false)} silences
   * @return the root to resolve names against, or null when nothing supplies one
   */
  static String resolveRoot(String configured, Env env) {
    return configured != null ? configured : env.get("SHOJIKU_TEMPLATE_ROOT");
  }

  /** This client's default locale, which a per-call one beats. */
  String lang() {
    return config.lang();
  }

  Env env() {
    return env.get();
  }

  Log log() {
    return log.get();
  }

  Lockdown lockdown() {
    return lockdown.get();
  }

  EngineLibrary library() {
    return library.get();
  }

  List<String> fontDirs() {
    return fontDirs.get();
  }

  List<String> localeDirs() {
    return localeDirs.get();
  }

  /** The template root, or null when nothing configured one. */
  TemplateRoot templateRoot() {
    return templateRoot.get();
  }

  /**
   * Built once, on first use.
   *
   * <p>A holder rather than a null check, so a supplier that legitimately produces null — which the
   * template root does — is still built only once.
   */
  private static <T> Supplier<T> memoize(Supplier<T> build) {
    return new Supplier<>() {
      private boolean built;
      private T value;

      @Override
      public synchronized T get() {
        if (!built) {
          value = build.get();
          built = true;
        }
        return value;
      }
    };
  }
}
