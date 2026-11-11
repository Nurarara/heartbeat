// Minimal, bounded PNG reader for provider output. Supports the formats image models
// actually return (8-bit RGB/RGBA, non-interlaced) and nothing else.
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function isPng(bytes: Uint8Array) {
  return bytes.length > 8 && SIGNATURE.every((value, index) => bytes[index] === value);
}

async function inflate(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader(), output = new Uint8Array(expected);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      if (length + value.byteLength > expected) { await reader.cancel(); throw new Error('PNG data is larger than declared.'); }
      output.set(value, length); length += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  if (length !== expected) throw new Error('PNG data is truncated.');
  return output;
}

/** Returns RGBA pixels. Rejects interlaced, paletted, 16-bit and oversized images. */
export async function decodePng(bytes: Uint8Array, maxPixels = 4_200_000): Promise<{ width: number; height: number; data: Uint8Array }> {
  if (!isPng(bytes)) throw new Error('Not a PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, channels = 0; const parts: Uint8Array[] = []; let idat = 0;
  while (at + 12 <= bytes.length) {
    const size = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), start = at + 8;
    if (start + size + 4 > bytes.length) throw new Error('PNG chunk is truncated.');
    if (type === 'IHDR') {
      width = view.getUint32(start); height = view.getUint32(start + 4);
      const depth = bytes[start + 8], color = bytes[start + 9], interlace = bytes[start + 12];
      if (depth !== 8 || ![2, 6].includes(color) || bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || interlace !== 0) throw new Error('Unsupported PNG format.');
      if (!width || !height || width * height > maxPixels) throw new Error('PNG dimensions are out of range.');
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') { parts.push(bytes.subarray(start, start + size)); idat += size; }
    else if (type === 'IEND') break;
    at = start + size + 4;
  }
  if (!channels || !idat) throw new Error('PNG is incomplete.');
  const joined = new Uint8Array(idat); let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  const stride = width * channels, raw = await inflate(joined, height * (stride + 1));
  const rows = new Uint8Array(height * stride), rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], source = y * (stride + 1) + 1, target = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[source + x], left = x >= channels ? rows[target + x - channels] : 0, up = y ? rows[target - stride + x] : 0, corner = y && x >= channels ? rows[target - stride + x - channels] : 0;
      let predicted: number;
      if (filter === 0) predicted = 0;
      else if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) { const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner); predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner; }
      else throw new Error('Unsupported PNG filter.');
      rows[target + x] = (value + predicted) & 255;
    }
  }
  for (let pixel = 0; pixel < width * height; pixel++) {
    const from = pixel * channels, to = pixel * 4;
    rgba[to] = rows[from]; rgba[to + 1] = rows[from + 1]; rgba[to + 2] = rows[from + 2]; rgba[to + 3] = channels === 4 ? rows[from + 3] : 255;
  }
  return { width, height, data: rgba };
}
