#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

function renderIcon(size, round = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#20c997');
  gradient.addColorStop(0.48, '#0b7285');
  gradient.addColorStop(1, '#07121a');
  ctx.fillStyle = gradient;
  if (round) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundedRect(ctx, 0, 0, size, size, size * 0.22);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(7, 18, 26, 0.22)';
  ctx.beginPath();
  ctx.arc(size * 0.64, size * 0.3, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffbe0b';
  ctx.font = `900 ${Math.round(size * 0.65)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Y', size * 0.5, size * 0.51);
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, size * 0.28, size * 0.8, size * 0.44, Math.max(2, size * 0.045), size * 0.025);
  ctx.fill();
  return canvas.toBuffer('image/png');
}

for (const [density, size] of Object.entries(densities)) {
  const directory = join(res, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, 'ic_launcher.png'), renderIcon(size)),
    writeFile(join(directory, 'ic_launcher_round.png'), renderIcon(size, true))
  ]);
}

console.log('✓ Icônes Android Yallah générées.');
