// Genera los íconos PWA de Bellforce (isotipo: rayo blanco sobre fondo negro).
// Rasterizador propio + codificador PNG con zlib (sin dependencias externas).
// Uso: node scripts/gen-icons.cjs  → escribe public/icons/*.png
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Rayo del logo (viewBox 24): M13 10V3L4 14h7v7l9-11h-7z
const BOLT = [[13, 10], [13, 3], [4, 14], [11, 14], [11, 21], [20, 10]];

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// CRC32 (para chunks PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(S, boltFactor) {
  const scale = (S * boltFactor) / 24;
  const off = (S - 24 * scale) / 2; // rayo centrado
  // Scanlines RGB con filtro 0 por fila
  const raw = Buffer.alloc((S * 3 + 1) * S);
  let p = 0;
  for (let y = 0; y < S; y++) {
    raw[p++] = 0; // filter byte
    for (let x = 0; x < S; x++) {
      const bx = (x - off) / scale, by = (y - off) / scale;
      const white = pointInPoly(bx, by, BOLT);
      const v = white ? 255 : 0; // rayo blanco / fondo negro
      raw[p++] = v; raw[p++] = v; raw[p++] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const jobs = [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-64.png', 64]];
for (const [name, size] of jobs) {
  fs.writeFileSync(path.join(outDir, name), makePng(size, 0.46));
  console.log('wrote', name, size + 'x' + size);
}
