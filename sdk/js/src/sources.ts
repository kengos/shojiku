/**
 * The sources one render runs over.
 *
 * The template text, the definitions text when there are any, and the directory
 * bundled assets resolve against.
 *
 * A value rather than a file layout, because there are two ways to get one and
 * only one of them involves the filesystem. `TemplateRoot` produces it by
 * resolving a NAME; `Client.generateSource` produces it from bytes the
 * application already has. Everything downstream — the request envelope, the
 * addon — sees the same object either way, which is what keeps the second
 * entrance from being a second code path.
 */

/** One render's template text, definitions text and assets directory. */
export interface Sources {
  readonly template: string;
  readonly definitions?: string | null;
  readonly assetsDir?: string | null;
}
