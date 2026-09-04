//! Test-only fixture builders shared by the raster tests.

/// Builds a minimal valid PNG (fixed-color square) for tests.
pub fn tiny_png(width: u32, height: u32) -> Vec<u8> {
    // A PNG is: signature, IHDR, IDAT (zlib'd scanlines), IEND. The
    // IDAT here uses stored (uncompressed) deflate blocks.
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();

    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    // 8-bit grayscale, no interlace.
    ihdr.extend_from_slice(&[8, 0, 0, 0, 0]);
    push_chunk(&mut out, b"IHDR", &ihdr);

    // Raw scanlines: each row is a filter byte + `width` gray pixels.
    let mut raw = Vec::new();
    for _ in 0..height {
        raw.push(0u8);
        raw.extend(std::iter::repeat_n(0x55u8, width as usize));
    }
    // zlib wrapper around a single stored deflate block.
    let mut idat = vec![0x78, 0x01];
    let len = raw.len() as u16;
    idat.push(0x01);
    idat.extend_from_slice(&len.to_le_bytes());
    idat.extend_from_slice(&(!len).to_le_bytes());
    idat.extend_from_slice(&raw);
    idat.extend_from_slice(&adler32(&raw).to_be_bytes());
    push_chunk(&mut out, b"IDAT", &idat);

    push_chunk(&mut out, b"IEND", &[]);
    out
}

fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let mut crc_input = kind.to_vec();
    crc_input.extend_from_slice(data);
    out.extend_from_slice(&crc32(&crc_input).to_be_bytes());
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in data {
        a = (a + u32::from(byte)) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}
