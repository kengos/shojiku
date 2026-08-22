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

/** Reduce a PRESET ID to a safe filename stem (fixed charset, non-empty). Ids
 * are build-validated ASCII, so narrowing to `[a-z0-9._-]` costs nothing here.
 * It also collapses dot RUNS and strips leading dots: `.` is legal inside a
 * name but `..` is traversal, and separators alone becoming dashes would leave
 * it intact. A user-authored DOCUMENT name goes through `safeDocumentStem`
 * instead — this charset would delete it. */
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

/** Characters a download name may never carry, in any language: C0 and C1
 * controls, the path separators, the punctuation Windows refuses in a file
 * name, and — with two deliberate exceptions — every Unicode FORMAT character.
 *
 * `\p{Cf}` rather than a hand-listed set, because a hand-listed set is how
 * this went wrong once already: it named U+200E/U+200F and missed U+061C
 * ARABIC LETTER MARK, which is the same mark for Arabic and became reachable
 * through this very change. The category is the rule the list was approximating
 * — every invisible formatting character goes, so a name cannot carry a
 * direction override that makes it DISPLAY a different extension than it has
 * (the classic download spoof), and two names that render identically cannot
 * write to different files.
 *
 * U+200C and U+200D are the exceptions and are KEPT. ZWNJ and ZWJ are format
 * characters too, but they carry MEANING in Devanagari and in emoji sequences
 * — stripping them would corrupt exactly the names this function exists to
 * preserve. The lookahead is what excludes them from the category match. */
const UNSAFE_NAME_CHARS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters out of a hostile document name is the intent.
  /[\u0000-\u001f\u007f-\u009f/\\<>:"|?*]|(?![\u200c\u200d])\p{Cf}/gu;

/** The stem's byte budget: 251, which is 255 — the byte length a filesystem
 * takes for one file NAME — minus the four bytes of `.pdf`.
 *
 * Derived rather than picked, because the cap is here for exactly one reason:
 * a name a filesystem cannot write. An arbitrary smaller number would truncate
 * names that are perfectly writable, which the ASCII-only rule this replaces
 * never did. A 120-CHARACTER rename is up to ~360 bytes in CJK, so the bound
 * is still reachable — it is the character cap that is not the same bound. */
const MAX_STEM_BYTES = 251;

/** Clip to a byte budget on a CODE POINT boundary — `for…of` iterates code
 * points, so an astral character is never cut into a lone surrogate. */
function clipToBytes(text: string, max: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= max) {
    return text;
  }
  let out = '';
  let used = 0;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (used + size > max) {
      break;
    }
    out += char;
    used += size;
  }
  return out;
}

/** Reduce a USER-AUTHORED document name to a download filename stem.
 *
 * Unlike `safeStem` above, this KEEPS the name: it strips what is dangerous
 * rather than what is unfamiliar, so a Japanese document downloads under the
 * name its author gave it. The ASCII-only rule this replaces did not fail
 * loudly — it quietly produced `template.pdf` for every name with no Latin
 * letters in it, and `a4.pdf` for `白紙 (A4)`. */
export function safeDocumentStem(name: string): string {
  const cleaned = name
    // Case still folds, as it always did — that is a filename CONVENTION, not
    // a safety rule, and it is a no-op on the scripts this change is for.
    .toLowerCase()
    .replace(UNSAFE_NAME_CHARS, '-')
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  // Clipping can expose a fresh trailing separator, so tidy after cutting.
  const clipped = clipToBytes(cleaned, MAX_STEM_BYTES).replace(/[.-]+$/, '');
  return clipped.length > 0 ? clipped : 'template';
}

/** Compose the PDF download. The name is user-controlled (a rename, the
 * template's own `name`, or a mounted host's entry name), so it goes through
 * the document-name guard before it reaches the filesystem. */
export function buildPdfExport(name: string, bytes: Uint8Array): ExportBytes {
  return { filename: `${safeDocumentStem(name)}.pdf`, bytes };
}
