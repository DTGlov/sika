// Pure Node.js PNG icon generator — no external deps
import { createDeflate, deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// ── Brand colours ───────────────────────────────────────────────
const GREEN  = [0x00, 0xD9, 0xA3, 0xFF];
const DARK   = [0x0A, 0x0A, 0x0B, 0xFF];
const TRANSP = [0x00, 0x00, 0x00, 0x00];

// ── Minimal PNG encoder ─────────────────────────────────────────
function crc32(buf) {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  let c = 0xFFFFFFFF;
  for (const b of buf) c = t[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(pixels, size) {
  // pixels: flat Uint8Array of RGBA, row-major
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: RGB (drop alpha for compatibility)
  // Actually let's do RGBA = colour type 6
  ihdr[9] = 6;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Build raw scanlines (filter byte 0 + RGBA row)
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const dst = y * (1 + size * 4) + 1 + x * 4;
      const src = (y * size + x) * 4;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
      raw[dst+3] = pixels[src+3];
    }
  }

  const idat = deflateSync(raw, { level: 6 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel renderer ──────────────────────────────────────────────
function fillPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  pixels[i]   = color[0];
  pixels[i+1] = color[1];
  pixels[i+2] = color[2];
  pixels[i+3] = color[3];
}

function fillRect(pixels, size, x1, y1, x2, y2, color) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      fillPixel(pixels, size, x, y, color);
}

// Anti-aliased circle coverage (for rounded corners)
function circleAlpha(cx, cy, r, px, py) {
  const dx = px - cx, dy = py - cy;
  const d  = Math.sqrt(dx*dx + dy*dy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function drawRoundedRect(pixels, size, x1, y1, x2, y2, r, color) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      let alpha = 1;
      if (x < x1 + r && y < y1 + r) alpha = circleAlpha(x1+r, y1+r, r, x, y);
      else if (x > x2 - r && y < y1 + r) alpha = circleAlpha(x2-r, y1+r, r, x, y);
      else if (x < x1 + r && y > y2 - r) alpha = circleAlpha(x1+r, y2-r, r, x, y);
      else if (x > x2 - r && y > y2 - r) alpha = circleAlpha(x2-r, y2-r, r, x, y);
      if (alpha <= 0) continue;
      const i = (y * size + x) * 4;
      const a = Math.round(alpha * 255);
      pixels[i]   = color[0];
      pixels[i+1] = color[1];
      pixels[i+2] = color[2];
      pixels[i+3] = a;
    }
  }
}

// Thick anti-aliased line
function drawLine(pixels, size, x1, y1, x2, y2, color, thickness) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy);
  const steps = Math.ceil(len * 2);
  const hw = thickness / 2;

  for (let s = 0; s <= steps; s++) {
    const t  = s / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;

    const r = Math.ceil(hw + 1);
    for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++) {
      for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const d    = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        const alpha = Math.max(0, Math.min(1, hw - d + 0.5));
        if (alpha <= 0) continue;
        const i = (py * size + px) * 4;
        const src_a = pixels[i+3] / 255;
        const out_a = alpha + src_a * (1 - alpha);
        if (out_a === 0) continue;
        pixels[i]   = Math.round((color[0] * alpha + pixels[i]   * src_a * (1 - alpha)) / out_a);
        pixels[i+1] = Math.round((color[1] * alpha + pixels[i+1] * src_a * (1 - alpha)) / out_a);
        pixels[i+2] = Math.round((color[2] * alpha + pixels[i+2] * src_a * (1 - alpha)) / out_a);
        pixels[i+3] = Math.round(out_a * 255);
      }
    }
  }
}

// ── Render one icon ─────────────────────────────────────────────
function renderIcon(size, maskable = false) {
  const pixels = new Uint8Array(size * size * 4); // transparent

  if (maskable) {
    // Maskable: full bleed green background, logo centred at 72%
    fillRect(pixels, size, 0, 0, size - 1, size - 1, GREEN);
    const inner = Math.round(size * 0.72);
    const off   = Math.round((size - inner) / 2);
    renderLogoInto(pixels, size, off, off, inner);
  } else {
    const r = Math.round(size * 0.22);
    drawRoundedRect(pixels, size, 0, 0, size - 1, size - 1, r, GREEN);
    renderLogoInto(pixels, size, 0, 0, size);
  }

  return pixels;
}

function renderLogoInto(pixels, size, ox, oy, inner) {
  const pad = Math.round(inner * 0.18);
  const sw  = Math.round(inner * 0.075);

  // Trend-up polyline: 4 points
  const pts = [
    [ox + pad,                  oy + pad + inner * 0.42],
    [ox + pad + inner * 0.30,   oy + pad + inner * 0.17],
    [ox + pad + inner * 0.62,   oy + pad + inner * 0.35],
    [ox + pad + inner * 0.82,   oy + pad],
  ];

  for (let i = 0; i < pts.length - 1; i++) {
    drawLine(pixels, size, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], DARK, sw);
  }
}

// ── Write icons ─────────────────────────────────────────────────
const icons = [
  { name: 'icon-192.png',         size: 192 },
  { name: 'icon-512.png',         size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-maskable-512.png',size: 512, maskable: true },
];

for (const { name, size, maskable } of icons) {
  const pixels = renderIcon(size, maskable ?? false);
  const png    = encodePNG(pixels, size);
  writeFileSync(join(OUT, name), png);
  console.log(`✓ public/icons/${name} (${png.length} bytes)`);
}
