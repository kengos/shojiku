// A minimal store-only (uncompressed) ZIP writer.
//
// The export kit must arrive as ONE artifact laid out the way the CLI expects
// (`packs/fonts/<id>/manifest.yml` beside `templates.yml`), so the template
// engineer unzips and renders rather than hand-rebuilding a directory tree.
// Store-only keeps this ~90 lines with no dependency and no compressor to feed
// hostile input to; a kit is a few KB of text plus no font bytes (the faces are
// fetched from their pins), so compression buys nothing.
//
// Deterministic: a fixed timestamp, no extra fields — the same kit twice is the
// same bytes.

/** One file in the kit. `path` uses forward slashes (the ZIP convention). */
export interface ZipEntry {
  readonly path: string;
  readonly text: string;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

/** CRC-32 (IEEE) of the bytes — the integrity field every ZIP entry carries. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  /** Little-endian fixed-width integer, the ZIP field encoding. */
  int(value: number, width: 2 | 4): void {
    const out = new Uint8Array(width);
    for (let i = 0; i < width; i += 1) {
      out[i] = (value >>> (i * 8)) & 0xff;
    }
    this.push(out);
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

/** Build a store-only ZIP from text entries. Entry paths are written as given;
 * callers compose them from guarded ids (see `kit.ts`), never from raw input. */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local = new ByteWriter();
  const central = new ByteWriter();
  const records: { offset: number; crc: number; size: number; name: Uint8Array }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = encoder.encode(entry.text);
    const crc = crc32(body);
    records.push({ offset: local.length, crc, size: body.length, name });

    local.int(0x04034b50, 4); // local file header
    local.int(20, 2); // version needed
    local.int(0, 2); // flags
    local.int(0, 2); // method: store
    local.int(0, 2); // mod time (fixed → deterministic)
    local.int(0x21, 2); // mod date (fixed: 1980-01-01)
    local.int(crc, 4);
    local.int(body.length, 4); // compressed size == size
    local.int(body.length, 4);
    local.int(name.length, 2);
    local.int(0, 2); // extra length
    local.push(name);
    local.push(body);
  }

  for (const record of records) {
    central.int(0x02014b50, 4); // central directory header
    central.int(20, 2); // version made by
    central.int(20, 2); // version needed
    central.int(0, 2); // flags
    central.int(0, 2); // method: store
    central.int(0, 2);
    central.int(0x21, 2);
    central.int(record.crc, 4);
    central.int(record.size, 4);
    central.int(record.size, 4);
    central.int(record.name.length, 2);
    central.int(0, 2); // extra
    central.int(0, 2); // comment
    central.int(0, 2); // disk number
    central.int(0, 2); // internal attrs
    central.int(0, 4); // external attrs
    central.int(record.offset, 4);
    central.push(record.name);
  }

  const end = new ByteWriter();
  end.int(0x06054b50, 4); // end of central directory
  end.int(0, 2); // disk
  end.int(0, 2); // start disk
  end.int(records.length, 2);
  end.int(records.length, 2);
  end.int(central.length, 4);
  end.int(local.length, 4);
  end.int(0, 2); // comment length

  const out = new ByteWriter();
  out.push(local.concat());
  out.push(central.concat());
  out.push(end.concat());
  return out.concat();
}
