package jp.kengos.shojiku;

import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * The entry point: a configured engine, and the sources to render with it.
 *
 * <pre>{@code
 * var client = ShojikuClient.builder().templates("src/main/templates").build();
 * var result = client.generate("receipt_ja", Map.of("customer", Map.of("name", "…")));
 * if (result.success()) {
 *   result.artifact().write(Path.of("receipt.pdf"));
 * }
 * }</pre>
 *
 * <p><b>Two entrances, deliberately.</b> {@link #generate} takes a template NAME and resolves it
 * against the configured root, which is where the containment rules live. {@link #generateSource}
 * takes the sources as TEXT the application already has — fetched from object storage, read out of
 * a database, written inline — because fetching is the application's act and this package downloads
 * nothing. Root containment does not apply to sources a caller supplied: there is no root to be
 * contained by, which is exactly why a strict client refuses that entrance.
 *
 * <p><b>Precedence, and its one deliberate asymmetry.</b> An explicit {@code templates(…)} beats
 * {@link Configuration#configure}, which beats {@code SHOJIKU_TEMPLATE_ROOT}; the pack directories
 * resolve the same way. What an application renders is the application's own decision. An explicit
 * {@code library(…)} is the other way round — {@code SHOJIKU_LIBRARY} beats it — because where the
 * ENGINE lives is an operator's decision that has to be able to win over application code, the same
 * order the subprocess SDKs give {@code SHOJIKU_BIN}. Passing {@code env(false)} disables every one
 * of those lookups at once. {@code strict} is the one setting configuration wins outright.
 *
 * <p><b>Synchronous, like five of the seven SDKs.</b> Rendering is CPU work with no I/O to overlap,
 * so an asynchronous wrapper here would be ceremony over a blocking call; a JVM application that
 * needs it has its own executor. (.NET and node get async surfaces because blocking THEIR runtimes
 * for the length of a render is not acceptable there.) The engine releases nothing this client
 * holds across a call, so several threads may share one client — see the concurrency suite.
 */
public final class ShojikuClient {

  private static final String ANCHOR_FORMS = "`anchors` (paths) or `anchorsPem` (bytes)";

  private final Settings settings;
  private final Engine engine;

  private ShojikuClient(Config overrides) {
    this.settings = new Settings(overrides);
    this.engine = new Engine(settings.library());
  }

  /**
   * A builder, which is how a language without keyword arguments spells nine optional settings.
   *
   * @return a new builder
   */
  public static Builder builder() {
    return new Builder();
  }

  /**
   * What this build of the engine can do — its version, capability keys and builtin locales.
   *
   * <p>Gate a feature on this rather than on a package version.
   *
   * <p>A plain map, deliberately. The payload is an append-only wire this SDK does not model,
   * exactly as a diagnostic's typed args pass through untranslated: a typed value object would have
   * to grow a field in seven languages every time the engine adds one, and an application reading a
   * key its engine is too old to send already has to handle a missing one.
   *
   * @return the engine's own description of itself
   */
  public Map<String, Object> engineInfo() {
    Snapshot snapshot = engine.engineInfo();
    Outcome.guard(snapshot);
    return Json.object(snapshot.json());
  }

  /**
   * Render {@code name} with {@code params}.
   *
   * <p>{@code params} may be a Map or List (serialized here) or a String you already have — JSON or
   * YAML, since the engine parses either and a String is passed through verbatim.
   *
   * <p>A rejected template name is a FAILED RESULT, not an exception: a hostile name is a fact
   * about the request, not a bug in the program.
   *
   * @param name the template's identifier — never a path
   * @param params the data to render with
   * @return the document, or the failure
   */
  public Result<DocumentArtifact> generate(String name, Object params) {
    return generate(name, params, null);
  }

  /**
   * Render {@code name}, overriding this client's locale for this call alone.
   *
   * <p>Which is how a multi-locale application renders one template per buyer's locale without
   * building a second client. (The ruby reference spells the same override as a derived client,
   * because a keyword beside its trailing-hash params would break the ordinary call form; what
   * every SDK mirrors is that a per-call locale beats the client-wide one, not the spelling.)
   *
   * @param name the template's identifier — never a path
   * @param params the data to render with
   * @param lang a per-call BCP 47 locale
   * @return the document, or the failure
   */
  public Result<DocumentArtifact> generate(String name, Object params, String lang) {
    Sources sources;
    try {
      sources = templateRoot().resolve(name);
    } catch (RejectedException error) {
      return Result.fromFailure(rejection(error, Step.GENERATE));
    }
    return render(sources, params, Origin.RENDERED, lang, "template", Texts.bounded(name));
  }

  /**
   * Render sources the APPLICATION supplies.
   *
   * <p>For templates that do not live in a directory this package can see: fetched from object
   * storage, stored in a database, or written inline. Fetching them stays the application's act —
   * nothing here opens a socket.
   *
   * <p>{@code template} is source TEXT, never a path: a path-shaped value is a template that fails
   * to parse. An SDK that helpfully opened it would make every containment rule bypassable by
   * spelling the same thing differently.
   *
   * @param template the template's source text
   * @return the document, or the failure
   */
  public Result<DocumentArtifact> generateSource(String template) {
    return generateSource(template, null, null, null, null);
  }

  /**
   * Render sources the application supplies, with everything a render can take.
   *
   * <p>{@code assetsDir} is per call rather than per client, because bundled assets belong to a
   * template rather than to a deployment. Without it, bundled image sources are disabled: inline
   * sources have no directory of their own.
   *
   * @param template the template's source text
   * @param definitions the definitions' source text, or null
   * @param assetsDir the directory bundled assets resolve against, or null
   * @param params the data to render with
   * @param lang a per-call BCP 47 locale
   * @return the document, or the failure
   */
  public Result<DocumentArtifact> generateSource(
      String template, String definitions, Path assetsDir, Object params, String lang) {
    settings.lockdown().sourceEntrance();
    Sources sources =
        new Sources(template, definitions, assetsDir == null ? null : assetsDir.toString());
    return render(sources, params, Origin.SOURCE, lang);
  }

  /**
   * Re-enter an archived document.
   *
   * <p>So bytes signed some time ago can be verified — or re-signed — without hand-building an
   * artifact.
   *
   * <p>The result is marked as {@link Origin#LOADED}: its bytes are the caller's rather than this
   * client's own render, which is a distinction a strict client acts on. Its page count is null,
   * honestly: nothing here laid anything out.
   *
   * @param data the archived PDF's bytes
   * @return the artifact
   */
  public DocumentArtifact artifact(byte[] data) {
    return new DocumentArtifact(data.clone(), List.of(), this, null, Origin.LOADED);
  }

  /**
   * Sign an artifact.
   *
   * <p>The signed bytes begin with the input byte for byte — signing appends a revision.
   *
   * @param artifact the document to sign
   * @param provider a {@link SigningProvider}, or the NAME of one registered in configuration. A
   *     strict client takes the name only.
   * @return the signed document, or the failure
   */
  public Result<DocumentArtifact> sign(DocumentArtifact artifact, Object provider) {
    SigningProvider signer = settings.lockdown().provider(provider);
    settings.lockdown().signable(artifact);
    return settings.log().timed("sign", () -> signed(artifact, signer));
  }

  /**
   * Verify an artifact against trust anchors.
   *
   * <p>Anchors are required and are given as paths (one or several) or as PEM bytes (which may
   * carry several concatenated). Which form you passed is explicit rather than sniffed, and passing
   * both throws rather than silently preferring one. There is no fallback to the machine's trust
   * store, because the engine never consults one — a default would answer a different question than
   * you asked.
   *
   * <p>A signature that does not verify is a FAILED result that still carries the report, so {@code
   * notChecked} reaches you either way.
   *
   * @param artifact the document to verify
   * @param anchors paths to PEM trust anchors, or null
   * @param anchorsPem trust anchors as PEM bytes, or null
   * @return the report, on a passing verdict and a failing one alike
   */
  public Result<VerificationReport> verify(
      DocumentArtifact artifact, List<Path> anchors, byte[] anchorsPem) {
    byte[] pem;
    try {
      pem = anchorMaterial(anchors, anchorsPem);
    } catch (MaterialUnreadableException error) {
      return Result.fromFailure(new Failure(Step.VERIFY, error.kind(), error.getMessage()));
    }
    return settings
        .log()
        .timed("verify", () -> Outcome.verdict(engine.verify(artifact.raw(), pem)));
  }

  /** The configured template root, or null when nothing configured one. */
  TemplateRoot templateRootOrNull() {
    return settings.templateRoot();
  }

  private TemplateRoot templateRoot() {
    TemplateRoot root = settings.templateRoot();
    if (root != null) {
      return root;
    }
    throw new UsageException(
        "no template root: pass ShojikuClient.builder().templates(…), set it with "
            + "Configuration.configure, or set SHOJIKU_TEMPLATE_ROOT (which `env(false)` disables). "
            + "Sources you already hold go to `generateSource`.");
  }

  private Result<DocumentArtifact> render(
      Sources sources, Object params, Origin origin, String lang, Object... fields) {
    Request request =
        new Request(
            sources,
            params == null ? Map.of() : params,
            lang != null ? lang : settings.lang(),
            settings.fontDirs(),
            settings.localeDirs());
    byte[] encoded = request.encoded();
    return settings
        .log()
        .timed(
            "generate",
            () -> Outcome.document(engine.render(encoded), Step.GENERATE, this, origin),
            fields);
  }

  /**
   * The signed document inherits the origin of what it signed.
   *
   * <p>Appending a revision does not launder where the document came from.
   */
  private Result<DocumentArtifact> signed(DocumentArtifact artifact, SigningProvider provider) {
    Snapshot snapshot;
    try {
      snapshot =
          engine.sign(
              artifact.raw(), provider.key(), provider.certificate(), provider.passphrase());
    } catch (MaterialUnreadableException error) {
      return Result.fromFailure(new Failure(Step.SIGN, error.kind(), error.getMessage()));
    }
    return Outcome.document(snapshot, Step.SIGN, this, artifact.origin());
  }

  private static byte[] anchorMaterial(List<Path> paths, byte[] pem) {
    if (paths != null && pem != null) {
      throw new UsageException("verify takes either " + ANCHOR_FORMS + ", not both");
    }
    if (pem != null) {
      return pem;
    }
    if (paths == null) {
      throw new UsageException("verify needs " + ANCHOR_FORMS);
    }

    ByteArrayOutputStream joined = new ByteArrayOutputStream();
    for (Path path : paths) {
      if (joined.size() > 0) {
        joined.write('\n');
      }
      byte[] material = Texts.readMaterial(path, "anchor_unreadable");
      joined.write(material, 0, material.length);
    }
    return joined.toByteArray();
  }

  private static Failure rejection(RejectedException error, Step step) {
    Failure cause =
        error.causeMessage() == null ? null : new Failure(step, "io", error.causeMessage());
    return new Failure(step, error.kind(), error.getMessage(), null, cause);
  }

  /** Builds a client. Every setting is optional; the precedence is documented on {@link Config}. */
  public static final class Builder {

    private Config config = Config.empty();

    private Builder() {}

    /**
     * The directory template names resolve against.
     *
     * @param path the root
     * @return this builder
     */
    public Builder templates(String path) {
      config = config.withTemplates(path);
      return this;
    }

    /**
     * Directories holding font packs.
     *
     * @param dirs the directories
     * @return this builder
     */
    public Builder fontDirs(List<String> dirs) {
      config = config.withFontDirs(dirs);
      return this;
    }

    /**
     * Directories holding locale packs.
     *
     * @param dirs the directories
     * @return this builder
     */
    public Builder localeDirs(List<String> dirs) {
      config = config.withLocaleDirs(dirs);
      return this;
    }

    /**
     * The BCP 47 locale a render defaults to.
     *
     * @param lang the locale
     * @return this builder
     */
    public Builder lang(String lang) {
      config = config.withLang(lang);
      return this;
    }

    /**
     * An explicit engine library path. {@code SHOJIKU_LIBRARY} still beats it.
     *
     * @param path the library
     * @return this builder
     */
    public Builder library(String path) {
      config = config.withLibrary(path);
      return this;
    }

    /**
     * Where the host-side log channel writes.
     *
     * @param logger the sink
     * @return this builder
     */
    public Builder logger(ShojikuLogger logger) {
      config = config.withLogger(logger);
      return this;
    }

    /**
     * Whether to refuse the text entrance and unregistered providers.
     *
     * @param strict the lockdown
     * @return this builder
     */
    public Builder strict(boolean strict) {
      config = config.withStrict(strict);
      return this;
    }

    /**
     * Signing providers this client may be asked for by name.
     *
     * @param providers the whole set it may sign with
     * @return this builder
     */
    public Builder providers(Map<String, SigningProvider> providers) {
      config = config.withProviders(providers);
      return this;
    }

    /**
     * Whether {@code SHOJIKU_*} lookups happen at all.
     *
     * @param env the flag
     * @return this builder
     */
    public Builder env(boolean env) {
      config = config.withEnv(env);
      return this;
    }

    /**
     * Builds the client, opening the engine library.
     *
     * @return the client
     */
    public ShojikuClient build() {
      return new ShojikuClient(config);
    }
  }
}
