// Enregistrement des polices du studio (partagé rendu vidéo + affiches).
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let registered = false;

export function registerStudioFonts() {
  if (registered) return;
  const { GlobalFonts } = require('@napi-rs/canvas');
  const fontsDir = join(root, 'assets', 'fonts');
  const registrations = [
    ['Inter-Regular.ttf', 'Inter'],
    ['Inter-SemiBold.ttf', 'Inter'],
    ['Inter-ExtraBold.ttf', 'Inter'],
    ['NotoSansArabic-Regular.ttf', 'Noto Sans Arabic'],
    ['NotoSansArabic-Bold.ttf', 'Noto Sans Arabic']
  ];
  for (const [file, family] of registrations) {
    const path = join(fontsDir, file);
    if (existsSync(path)) {
      try {
        GlobalFonts.registerFromPath(path, family);
      } catch {
        // police absente : le rendu retombe sur la police par défaut
      }
    }
  }
  registered = true;
}

export function studioRoot() {
  return root;
}
