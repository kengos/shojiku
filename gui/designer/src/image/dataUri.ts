// Composing the `data:` URI an inserted image travels as — the value the
// `insertItem` op's `src` carries, so the image lives inside the template text.
// The base64 encoder is hand-rolled to avoid a `String.fromCharCode(...bytes)`
// spread, which overflows the call stack on a multi-megabyte image.

import type { ImageKind } from './sniff';

const MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-encode bytes without a `String.fromCharCode(...bytes)` spread (which
 * overflows the call stack on a multi-megabyte image). Processes three bytes at
 * a time; the tail handles 1- and 2-byte remainders with `=` padding. */
function base64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`;
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`;
  }
  return out;
}

/** Compose an image `data:` URI from raw bytes — the value the `insertItem`
 * op's `src` carries (the image travels inside the template text). */
export function composeDataUri(kind: ImageKind, bytes: Uint8Array): string {
  return `data:${MIME[kind]};base64,${base64(bytes)}`;
}
