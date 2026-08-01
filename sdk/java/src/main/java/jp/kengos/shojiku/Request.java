package jp.kengos.shojiku;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The one JSON envelope every document operation crosses with.
 *
 * <p>Both entrances build it: sources resolved from a template NAME and sources the application
 * handed over as TEXT produce the same request, because the C surface has one request schema — and
 * that schema rejects unknown keys, so a key the engine may legitimately not receive is dropped
 * rather than sent as null.
 */
final class Request {

  private final Sources sources;
  private final Object params;
  private final String lang;
  private final List<String> fontDirs;
  private final List<String> localeDirs;

  Request(
      Sources sources, Object params, String lang, List<String> fontDirs, List<String> localeDirs) {
    this.sources = sources;
    this.params = params;
    this.lang = lang;
    this.fontDirs = fontDirs == null ? List.of() : List.copyOf(fontDirs);
    this.localeDirs = localeDirs == null ? List.of() : List.copyOf(localeDirs);
  }

  Request(Sources sources, Object params) {
    this(sources, params, null, null, null);
  }

  /**
   * The serialized envelope as UTF-8 bytes.
   *
   * <p>Params that cannot be serialized are programmer misuse — the engine's surface is UTF-8 JSON
   * by contract, so there is nothing to render — but letting a raw writer error escape {@code
   * generate} would make callers catch a foreign class they never invited into their code.
   */
  byte[] encoded() {
    try {
      return Json.write(envelope()).getBytes(StandardCharsets.UTF_8);
    } catch (UsageException error) {
      throw error;
    } catch (RuntimeException error) {
      throw new UsageException(
          "params could not be serialized as UTF-8 JSON: " + error.getMessage(), error);
    }
  }

  private Map<String, Object> envelope() {
    Map<String, Object> envelope = new LinkedHashMap<>();
    envelope.put("template", sources.template());
    envelope.put("params", paramsSource());
    envelope.put("fontDirs", fontDirs);
    envelope.put("localeDirs", localeDirs);

    // Absent rather than null: the request schema rejects unknown and ill-typed
    // keys, so a key the engine may legitimately not receive is dropped instead
    // of sent empty.
    if (sources.definitions() != null) {
      envelope.put("definitions", sources.definitions());
    }
    if (sources.assetsDir() != null) {
      envelope.put("assetsDir", sources.assetsDir());
    }
    if (lang != null) {
      envelope.put("lang", lang);
    }
    return envelope;
  }

  /**
   * A String params is the caller's own source text, passed through VERBATIM.
   *
   * <p>The engine parses JSON or YAML (YAML is a superset), so re-encoding it here would only be a
   * chance to change it. Anything else is serialized as JSON.
   *
   * <p>There is deliberately no per-format method family — format dispatch is the engine's, and an
   * SDK that offered {@code generateYaml} would be claiming a distinction the engine does not make.
   */
  private String paramsSource() {
    return params instanceof String text ? text : Json.write(params);
  }
}
