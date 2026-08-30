import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStudioProject } from '../../lib/generator.mjs';
import { renderPoster, posterFilename } from '../../lib/posters.mjs';

const project = generateStudioProject({
  objective: 'Promouvoir le ménage',
  city: 'Casablanca',
  service: 'menage',
  duration: 15,
  style: 'commercial',
  language: 'fr'
});

test('renderPoster produit les dimensions HD attendues', async () => {
  for (const [format, width, height] of [['story', 1080, 1920], ['square', 1080, 1080]]) {
    const canvas = await renderPoster(project, { format });
    assert.equal(canvas.width, width);
    assert.equal(canvas.height, height);
    const png = canvas.toBuffer('image/png');
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
    assert.ok(png.length > 100_000);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
});

test('posterFilename retourne un nom portable', () => {
  const filename = posterFilename(project, 'story');
  assert.match(filename, /^[a-z0-9-]+-story\.png$/);
  assert.doesNotMatch(filename, /\s|[éèà]/);
});
