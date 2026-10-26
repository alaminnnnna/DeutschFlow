/**
 * Generates DeutschFlow PWA icons from an inline SVG (equalizer mark on a
 * green→teal gradient — matches the app's primary palette).
 *   public/icons/icon-192.png          any-purpose
 *   public/icons/icon-512.png          any-purpose
 *   public/icons/icon-maskable-512.png maskable (full-bleed, safe-zone mark)
 *   public/icons/apple-touch-icon.png  180×180 full-bleed for iOS
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'public/icons');

const BARS = [104, 176, 240, 176, 104];
const BAR_W = 38;
const GAP = 22;

function mark(cx, cy, scale) {
  const totalW = BARS.length * BAR_W + (BARS.length - 1) * GAP;
  const startX = cx - (totalW * scale) / 2;
  return BARS.map((h, i) => {
    const bh = h * scale;
    const x = startX + i * (BAR_W + GAP) * scale;
    const y = cy - bh / 2;
    return `<rect x="${x}" y="${y}" width="${BAR_W * scale}" height="${bh}" rx="${(BAR_W * scale) / 2}" fill="#ffffff"/>`;
  }).join('');
}

const gradient = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c7a4c"/>
      <stop offset="0.55" stop-color="#15866b"/>
      <stop offset="1" stop-color="#0e8f84"/>
    </linearGradient>
  </defs>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${gradient}
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <rect width="512" height="112" rx="112" fill="#ffffff" opacity="0.08"/>
  ${mark(256, 262, 1)}
</svg>`;

const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${gradient}
  <rect width="512" height="512" fill="url(#g)"/>
  <rect width="512" height="128" fill="#ffffff" opacity="0.08"/>
  ${mark(256, 256, 0.62)}
</svg>`;

await mkdir(OUT, { recursive: true });

await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
await sharp(Buffer.from(fullBleed)).resize(512, 512).png().toFile(path.join(OUT, 'icon-maskable-512.png'));
await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));

console.log('PWA icons written to public/icons');
