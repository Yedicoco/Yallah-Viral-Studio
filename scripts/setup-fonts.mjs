// Extrait les polices TTF depuis les paquets npm @fontsource (licences OFL)
// vers assets/fonts/, pour un rendu vidéo déterministe 100 % hors-ligne.
// Usage : node scripts/setup-fonts.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import woff2 from 'wawoff2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'fonts');

const FONTS = [
  // Inter (latin) — textes français/darija latine
  { pkg: '@fontsource/inter', file: 'inter-latin-400-normal.woff2', out: 'Inter-Regular.ttf' },
  { pkg: '@fontsource/inter', file: 'inter-latin-600-normal.woff2', out: 'Inter-SemiBold.ttf' },
  { pkg: '@fontsource/inter', file: 'inter-latin-800-normal.woff2', out: 'Inter-ExtraBold.ttf' },
  // Noto Sans Arabic — textes arabes
  { pkg: '@fontsource/noto-sans-arabic', file: 'noto-sans-arabic-arabic-400-normal.woff2', out: 'NotoSansArabic-Regular.ttf' },
  { pkg: '@fontsource/noto-sans-arabic', file: 'noto-sans-arabic-arabic-700-normal.woff2', out: 'NotoSansArabic-Bold.ttf' }
];

mkdirSync(outDir, { recursive: true });

for (const font of FONTS) {
  const src = join(root, 'node_modules', font.pkg, 'files', font.file);
  const woff2Buffer = readFileSync(src);
  const ttf = Buffer.from(await woff2.decompress(woff2Buffer));
  writeFileSync(join(outDir, font.out), ttf);
  console.log(`✓ ${font.out} (${Math.round(ttf.length / 1024)} Ko)`);
}
console.log('Polices prêtes dans assets/fonts/');
