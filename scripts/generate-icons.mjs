// Draws the PWA icons. They are generated rather than committed as opaque
// binaries so the shape and colours can be reviewed and changed in a diff.
//
//   node scripts/generate-icons.mjs
//
// No image dependency: a PNG is a signature, three chunks and a zlib stream,
// which is less code than justifying another package in the tree.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "apps/web/public/icons");

const BACKGROUND = [10, 10, 10];
const FOREGROUND = [244, 244, 245];
const ACCENT = [110, 231, 183];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixel) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x, y, size);
      const at = rowStart + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A terminal prompt: a chevron and a caret. Legible at 48px, which is the size
// that actually matters on a home screen.
function draw({ inset, rounded }) {
  return (x, y, size) => {
    const unit = size / 100;
    const radius = rounded ? size * 0.22 : 0;

    if (rounded) {
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      if (cx < radius && cy < radius) {
        const dx = radius - cx;
        const dy = radius - cy;
        if (dx * dx + dy * dy > radius * radius) return BACKGROUND;
      }
    }

    // The maskable variant keeps its art inside the safe zone, so a launcher
    // cropping it to a circle does not slice the glyph.
    const scale = inset ? 0.62 : 0.82;
    const px = (x - size / 2) / (unit * scale) + 50;
    const py = (y - size / 2) / (unit * scale) + 50;

    // Chevron: two strokes meeting at (52, 50). Each is clipped to its own
    // half, or they cross and the glyph reads as an X rather than a ">".
    const thickness = 12;
    const upper = Math.abs(py - (2 * px - 54)) < thickness && py <= 50;
    const lower = Math.abs(py - (-2 * px + 154)) < thickness && py >= 50;
    const inChevron = px > 22 && px < 56 && (upper || lower) && py > 20 && py < 80;

    // Caret: the underscore a prompt blinks on.
    const inCaret = px > 58 && px < 82 && py > 63 && py < 73;

    if (inChevron) return FOREGROUND;
    if (inCaret) return ACCENT;
    return BACKGROUND;
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  { file: "icon-192.png", size: 192, inset: false, rounded: false },
  { file: "icon-512.png", size: 512, inset: false, rounded: false },
  // Maskable art must survive a circular crop, so it is drawn smaller.
  { file: "maskable-512.png", size: 512, inset: true, rounded: false },
  // iOS applies its own corner radius and does not support transparency.
  { file: "apple-touch-icon.png", size: 180, inset: false, rounded: true },
];

for (const icon of icons) {
  const png = encodePng(icon.size, draw({ inset: icon.inset, rounded: icon.rounded }));
  writeFileSync(path.join(OUT_DIR, icon.file), png);
  process.stdout.write(`${icon.file} ${icon.size}x${icon.size} ${png.length}B\n`);
}
