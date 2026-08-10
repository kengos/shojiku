// What an image IS, decided by its BYTES: the v1 kind set and the magic-byte /
// root-element sniff behind it. The declared MIME is never trusted — only these
// bytes decide the format, which is what keeps a mislabelled payload from
// reaching the raster path at all.

/** Every image kind the GUI accepts — the same set the engine draws. */
export type ImageKind = 'png' | 'jpeg' | 'svg' | 'gif' | 'webp';

/** Raster kinds — the canvas re-encode keeps the source format. GIF and WebP
 * are deliberately absent: a canvas cannot emit GIF at all, and re-encoding
 * would silently drop an animation, so those two travel VERBATIM (an
 * over-budget one is refused rather than downscaled). */
export type RasterKind = 'png' | 'jpeg';

/** The kinds whose intrinsic dimensions the codec can measure — every kind but
 * SVG, which carries no pixel size. Wider than [`RasterKind`]: a GIF is
 * measurable but not re-encodable. */
export type ProbeKind = 'png' | 'jpeg' | 'gif' | 'webp';

/** The kinds that travel byte-for-byte: no probe-then-re-encode path exists.
 * A type predicate, so ruling them out narrows a probe kind to a
 * [`RasterKind`] the canvas can actually re-encode. */
export function isVerbatimKind(kind: ImageKind): kind is 'gif' | 'webp' {
  return kind === 'gif' || kind === 'webp';
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIG = [0xff, 0xd8, 0xff];
// The two GIF versions, spelled in full: a prefix check on `GIF8` alone would
// also admit `GIF8Xa` junk.
const GIF87A_SIG = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A_SIG = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
// WebP is a RIFF container: `RIFF` at 0, a 4-byte length, then `WEBP` at 8. The
// form tag is what distinguishes it from any other RIFF payload (wav, avi).
const RIFF_SIG = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORM = [0x57, 0x45, 0x42, 0x50];
const WEBP_FORM_OFFSET = 8;

function matchesAt(bytes: Uint8Array, sig: readonly number[], offset: number): boolean {
  if (bytes.length < offset + sig.length) {
    return false;
  }
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) {
      return false;
    }
  }
  return true;
}

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  return matchesAt(bytes, sig, 0);
}

/** Whether the decoded text is an SVG document: after stripping a BOM, leading
 * whitespace, an XML declaration, comments, and a DOCTYPE, the first element is
 * `<svg`. Binary formats are ruled out FIRST (png/jpeg magic), so a raster
 * decoded as text never reaches here. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  // Decode a bounded prefix — the root element sits near the top even behind a
  // comment/doctype; a multi-megabyte SVG needs only its head inspected.
  // `TextDecoder` (ignoreBOM defaults to false) consumes a leading UTF-8 BOM
  // during decode, so `head` never starts with U+FEFF here.
  let rest = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096));
  // Strip leading whitespace / XML PI / comments / DOCTYPE, repeatedly.
  for (;;) {
    const before = rest;
    rest = rest.replace(/^\s+/, '');
    if (rest.startsWith('<?')) {
      const end = rest.indexOf('?>');
      rest = end === -1 ? '' : rest.slice(end + 2);
    } else if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      rest = end === -1 ? '' : rest.slice(end + 3);
    } else if (rest.startsWith('<!')) {
      const end = rest.indexOf('>');
      rest = end === -1 ? '' : rest.slice(end + 1);
    }
    if (rest === before) {
      break;
    }
  }
  // The char after `<svg` in a real root tag: whitespace, `>`, `/` (self-close),
  // or `:` (a namespaced `<svg:svg>`). Anything else (`<svgfoo>`) is not SVG.
  return /^<svg[\s/>:]/.test(rest);
}

/** Identify an image by its bytes (never its declared MIME). Returns `null`
 * for anything outside the accepted set (HTML, a non-WebP RIFF container, a
 * truncated or empty file). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, PNG_SIG)) {
    return 'png';
  }
  if (startsWith(bytes, JPEG_SIG)) {
    return 'jpeg';
  }
  if (startsWith(bytes, GIF87A_SIG) || startsWith(bytes, GIF89A_SIG)) {
    return 'gif';
  }
  if (startsWith(bytes, RIFF_SIG) && matchesAt(bytes, WEBP_FORM, WEBP_FORM_OFFSET)) {
    return 'webp';
  }
  if (looksLikeSvg(bytes)) {
    return 'svg';
  }
  return null;
}
