package jp.kengos.shojiku;

/**
 * The sources one render runs over.
 *
 * <p>A value rather than a file layout, because there are two ways to get one and only one of them
 * involves the filesystem. {@link TemplateRoot} produces it by resolving a NAME; {@link
 * ShojikuClient#generateSource} produces it from text the application already has. Everything
 * downstream — the request envelope, the engine — sees the same object either way, which is what
 * keeps the second entrance from being a second code path.
 *
 * @param template the template source text
 * @param definitions the definitions source text, when there are any
 * @param assetsDir the directory bundled assets resolve against, when there is one
 */
record Sources(String template, String definitions, String assetsDir) {

  Sources(String template) {
    this(template, null, null);
  }
}
