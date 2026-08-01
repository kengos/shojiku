package jp.kengos.shojiku;

import java.util.List;
import java.util.Map;

/**
 * Process-wide defaults for every client built after they are set.
 *
 * <p>The ecosystem idiom (a configuration call in application start-up) OVER the builder, never a
 * third precedence layer: what {@link Configuration#configure} sets stands exactly where an
 * explicit builder argument stands against the environment. So the order is
 *
 * <pre>  explicit builder argument &gt; Configuration.configure &gt; SHOJIKU_*</pre>
 *
 * for the template root and the pack directories, and the deliberate reverse for the engine library
 * — {@code SHOJIKU_LIBRARY} still wins over both, because where the engine lives is a deployment
 * decision.
 *
 * <p><b>{@code strict} is the one exception, and the only place configuration beats a call
 * site.</b> Strictness is a restriction rather than a default: an operator who declared a lockdown
 * must not have it lifted by application code. Every SDK mirrors that asymmetry.
 *
 * @param templates the directory template names resolve against
 * @param fontDirs directories holding font packs
 * @param localeDirs directories holding locale packs
 * @param lang the BCP 47 locale a render defaults to
 * @param library an explicit engine library path, which SHOJIKU_LIBRARY still beats
 * @param logger where the host-side log channel writes
 * @param strict whether clients refuse the text entrance and unregistered providers
 * @param providers the signing providers a strict client may be asked for by name
 * @param env whether SHOJIKU_* lookups happen at all
 */
public record Config(
    String templates,
    List<String> fontDirs,
    List<String> localeDirs,
    String lang,
    String library,
    ShojikuLogger logger,
    Boolean strict,
    Map<String, SigningProvider> providers,
    Boolean env) {

  /**
   * The same configuration with a different template root.
   *
   * @param value the directory template names resolve against
   * @return the derived configuration
   */
  public Config withTemplates(String value) {
    return new Config(value, fontDirs, localeDirs, lang, library, logger, strict, providers, env);
  }

  /**
   * The same configuration with different font-pack directories.
   *
   * @param value the directories
   * @return the derived configuration
   */
  public Config withFontDirs(List<String> value) {
    return new Config(templates, value, localeDirs, lang, library, logger, strict, providers, env);
  }

  /**
   * The same configuration with different locale-pack directories.
   *
   * @param value the directories
   * @return the derived configuration
   */
  public Config withLocaleDirs(List<String> value) {
    return new Config(templates, fontDirs, value, lang, library, logger, strict, providers, env);
  }

  /**
   * The same configuration with a different default locale.
   *
   * @param value the BCP 47 locale
   * @return the derived configuration
   */
  public Config withLang(String value) {
    return new Config(
        templates, fontDirs, localeDirs, value, library, logger, strict, providers, env);
  }

  /**
   * The same configuration with a different engine library path.
   *
   * @param value the path, which SHOJIKU_LIBRARY still beats
   * @return the derived configuration
   */
  public Config withLibrary(String value) {
    return new Config(templates, fontDirs, localeDirs, lang, value, logger, strict, providers, env);
  }

  /**
   * The same configuration with a host-side log channel.
   *
   * @param value where binding events are written
   * @return the derived configuration
   */
  public Config withLogger(ShojikuLogger value) {
    return new Config(
        templates, fontDirs, localeDirs, lang, library, value, strict, providers, env);
  }

  /**
   * The same configuration with the lockdown declared.
   *
   * @param value whether to refuse the text entrance and unregistered providers
   * @return the derived configuration
   */
  public Config withStrict(boolean value) {
    return new Config(
        templates, fontDirs, localeDirs, lang, library, logger, value, providers, env);
  }

  /**
   * The same configuration with a signing-provider registry.
   *
   * @param value the whole set this configuration may sign with
   * @return the derived configuration
   */
  public Config withProviders(Map<String, SigningProvider> value) {
    return new Config(templates, fontDirs, localeDirs, lang, library, logger, strict, value, env);
  }

  /**
   * The same configuration with environment lookups on or off.
   *
   * @param value whether SHOJIKU_* is read at all
   * @return the derived configuration
   */
  public Config withEnv(boolean value) {
    return new Config(
        templates, fontDirs, localeDirs, lang, library, logger, strict, providers, value);
  }

  /** The empty defaults every process starts with. */
  static Config empty() {
    return new Config(null, null, null, null, null, null, null, null, null);
  }

  /** Whether SHOJIKU_* lookups happen, defaulting to yes. */
  boolean envEnabled() {
    return env == null || env;
  }

  /** Whether this configuration declares a lockdown. */
  boolean isStrict() {
    return Boolean.TRUE.equals(strict);
  }

  /**
   * A copy with {@code overrides} applied — one client's resolution step.
   *
   * <p>A null override means "not given", so an explicit builder argument beats a configured
   * default and an absent one inherits it. {@code strict} is the exception documented above: it is
   * OR-ed rather than overridden.
   *
   * <p>{@code providers} REPLACES rather than merges. A client that declares its own registry is
   * stating the whole set it may sign with, and quietly adding globally-registered keys to that set
   * would defeat the point.
   */
  Config merge(Config overrides) {
    return new Config(
        overrides.templates == null ? templates : overrides.templates,
        overrides.fontDirs == null ? fontDirs : overrides.fontDirs,
        overrides.localeDirs == null ? localeDirs : overrides.localeDirs,
        overrides.lang == null ? lang : overrides.lang,
        overrides.library == null ? library : overrides.library,
        overrides.logger == null ? logger : overrides.logger,
        isStrict() || overrides.isStrict(),
        overrides.providers == null ? providers : overrides.providers,
        overrides.env == null ? env : overrides.env);
  }
}
