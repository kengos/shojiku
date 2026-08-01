// File open + export as pure functions. Open reads a size-capped text file (a
// hostile document — the cap bounds it before it reaches the engine's own
// capped parse); export composes a sanitized filename + the current YAML text.
// The actual `<input type=file>` read and the Blob download are wired in the app
// over these (browser-only), so the logic here stays unit-coverable.

/** A hard cap on an opened template file. Templates are hand-authored YAML;
 * 4 MiB is far above any real one and bounds a malicious upload. */
export const MAX_OPEN_BYTES = 4 * 1024 * 1024;

/** The minimal `File` surface open needs (size + async text), so tests need no
 * real File object. */
export interface FileLike {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

/** Read an opened file's text, rejecting anything over the cap before reading. */
export async function openText(file: FileLike): Promise<string> {
  if (file.size > MAX_OPEN_BYTES) {
    throw new Error(`${file.name} is too large (max ${MAX_OPEN_BYTES} bytes)`);
  }
  return file.text();
}

/** A composed export: a safe download filename and the bytes to write. */
export interface ExportFile {
  readonly filename: string;
  readonly text: string;
}

/** Reduce a name to a safe filename stem (fixed charset, non-empty). Used for
 * preset ids AND for the user-authored document name the PDF download is named
 * after, so it also collapses dot RUNS and strips leading dots: `.` is legal
 * inside a name but `..` is traversal, and separators alone becoming dashes
 * would leave it intact. */
function safeStem(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
  return cleaned.length > 0 ? cleaned : 'template';
}

/** Compose the export for a preset's edited template. */
export function buildExport(presetId: string, text: string): ExportFile {
  return { filename: `${safeStem(presetId)}-templates.yml`, text };
}

/** A composed BINARY export — the rendered PDF (the kit's artifact shape). */
export interface ExportBytes {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** Compose the PDF download. The name is user-controlled (a rename, or the
 * template's own `name`), so it goes through the same stem guard as every
 * other download name before it reaches the filesystem. */
export function buildPdfExport(name: string, bytes: Uint8Array): ExportBytes {
  return { filename: `${safeStem(name)}.pdf`, bytes };
}
