// Genera los íconos PWA de Bellforce (isotipo: rayo DORADO sobre CÍRCULO negro).
// Rasterizador propio + codificador PNG (RGBA) con zlib. Sin dependencias externas.
// Uso: node scripts/gen-icons.cjs  → escribe public/icons/*.png
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Rayo del logo (viewBox 24): M13 10V3L4 14h7v7l9-11h-7z
const BOLT = [[13, 10], [13, 3], [4, 14], [11, 14], [11, 21], [20, 10]];
const GOLD = [235, 202, 122]; // #ebca7a
const BLACK = [8, 8, 8];       // negro del isotipo

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// bg: 'circle' (disco negro sobre transparente) | 'square' (negro full-bleed, para maskable)
function makePng(S, boltFactor, bg) {
  const scale = (S * boltFactor) / 24;
  const off = (S - 24 * scale) / 2;
  const cx = S / 2, cy = S / 2, r = S / 2; // círculo edge-to-edge
  const stride = S * 4 + 1;
  const raw = Buffer.alloc(stride * S);
  let p = 0;
  for (let y = 0; y < S; y++) {
    raw[p++] = 0; // filter byte
    for (let x = 0; x < S; x++) {
      const bx = (x - off) / scale, by = (y - off) / scale;
      const inBolt = pointInPoly(bx, by, BOLT);
      let col, a;
      const inCircle = bg === 'square' ? true : ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) <= r * r;
      if (inBolt && inCircle) { col = GOLD; a = 255; }
      else if (inCircle) { col = BLACK; a = 255; }
      else { col = [0, 0, 0]; a = 0; } // fuera del círculo → transparente
      raw[p++] = col[0]; raw[p++] = col[1]; raw[p++] = col[2]; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  // any: círculo negro sobre transparente (se ve como el isotipo)
  ['icon-192.png', 192, 0.5, 'circle'],
  ['icon-512.png', 512, 0.5, 'circle'],
  ['favicon-64.png', 64, 0.5, 'circle'],
  // maskable: negro full-bleed (Android lo enmascara a círculo/squircle)
  ['icon-192-maskable.png', 192, 0.46, 'square'],
  ['icon-512-maskable.png', 512, 0.46, 'square'],
  // iOS: siempre esquina redondeada, fondo negro
  ['apple-touch-icon.png', 180, 0.5, 'square'],
];
for (const [name, size, bf, bg] of jobs) {
  fs.writeFileSync(path.join(outDir, name), makePng(size, bf, bg));
  console.log('wrote', name, size + 'x' + size, bg);
}
