// scripts/gen-icons.mjs — genera los iconos PNG de la PWA desde un SVG, con sharp.
// Uso: node scripts/gen-icons.mjs   (escribe en public/icons/)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'icons');
const ORANGE = '#f7931a';
const DARK = '#0b0e14';

// SVG del icono. `maskable` usa fondo oscuro + disco naranja con safe-zone; `any` es naranja a sangre.
function svg(size, maskable) {
  const r = maskable ? size * 0.34 : size * 0.22; // radio del disco/recorte
  const cx = size / 2;
  const fontSize = Math.round(size * (maskable ? 0.40 : 0.58));
  const bg = maskable ? DARK : ORANGE;
  const disc = maskable
    ? `<circle cx="${cx}" cy="${cx}" r="${size * 0.40}" fill="${ORANGE}"/>`
    : `<rect width="${size}" height="${size}" rx="${r}" fill="${ORANGE}"/>`;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  ${disc}
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-size="${fontSize}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">🦅</text>
</svg>`);
}

async function save(name, size, maskable) {
  const buf = await sharp(svg(size, maskable)).png().toBuffer();
  await sharp(buf).toFile(join(OUT, name));
  console.log('wrote', name, buf.length, 'bytes');
}

await mkdir(OUT, { recursive: true });
await save('icon-192.png', 192, false);
await save('icon-512.png', 512, false);
await save('icon-maskable-512.png', 512, true);
await save('apple-touch-icon.png', 180, false);
console.log('DONE');
