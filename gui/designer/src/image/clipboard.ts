// What a paste offers the image import: the file on the clipboard, if any.
//
// The declared MIME is deliberately NOT filtered on here — it is not trusted
// anywhere in this pipeline, and `sniffImage` is what decides whether the bytes
// are an image (a pasted non-image is refused with `unsupported_format`, the
// same answer the canvas drop gives). This function's whole job is the
// defensive walk to `files[0]`: a paste with no files at all must be reported
// as such, so the caller can leave the event alone and let the platform's own
// paste happen.

/** The first file on a clipboard, or `null` when it carries none (a text paste,
 * or an event with no `clipboardData` at all). */
export function imageFileFromClipboard(data: DataTransfer | null | undefined): File | null {
  return data?.files?.[0] ?? null;
}
