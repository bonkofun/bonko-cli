import { deflateSync } from 'node:zlib';
export function samplePng() {
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type);
    const body = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const n of body) crc = table[(crc ^ n) & 255] ^ (crc >>> 8);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    body.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  };
  const w = 320,
    h = 480,
    pixels = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      pixels[i] = 220 + Math.floor(x / 20);
      pixels[i + 1] = 190 + Math.floor(y / 10);
      pixels[i + 2] = 150 + Math.floor(x / 10);
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
