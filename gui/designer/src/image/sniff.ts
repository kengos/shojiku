// What an image IS, decided by its BYTES: the v1 kind set and the magic-byte /
// root-element sniff behind it. The declared MIME is never trusted — only these
// bytes decide the format, which is what keeps a mislabelled payload from
// reaching the raster path at all.

/** The image kinds v1 accepts (the engine also draws GIF/WebP; widening is one
 * added sniff branch each). */
export type ImageKind = 'png' | 'jpeg' | 'svg';

/** Raster kinds — the canvas re-encode keeps the source format. */
export type RasterKind = 'png' | 'jpeg';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) {
    return false;
  }
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) {
      return false;
    }
  }
  return true;
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
 * for anything outside the v1 set (GIF/WebP/HTML/truncated/empty). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, PNG_SIG)) {
    return 'png';
  }
  if (startsWith(bytes, JPEG_SIG)) {
    return 'jpeg';
  }
  if (looksLikeSvg(bytes)) {
    return 'svg';
  }
  return null;
}
