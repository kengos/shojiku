// Browser I/O glue: the two fetch readers every injected loader takes, the
// file-picker dialog and the download trigger. Part of the browser-entry group
// (`src/browser/`, coverage-excluded with `main.tsx`) — every one of these is a
// direct use of a browser global, and the modules that consume them take them
// as parameters and carry the 100% gate themselves.

import type { ExportArtifact } from '../fonts/kit';
import type { FileLike } from '../persistence/files';

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return res.text();
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Browse-for-a-file via a transient `<input type=file>`; resolves the picked
 * File (a `FileLike`) or `null` if the dialog was dismissed. */
export function pickFile(): Promise<FileLike | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yml,.yaml,text/yaml';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Trigger a browser download of the composed export (YAML text, a ZIP kit,
 * or the rendered PDF — the binary type follows the composed filename). */
export function download(file: ExportArtifact): void {
  const blob =
    'bytes' in file
      ? new Blob([file.bytes as BlobPart], {
          type: file.filename.endsWith('.pdf') ? 'application/pdf' : 'application/zip',
        })
      : new Blob([file.text], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
