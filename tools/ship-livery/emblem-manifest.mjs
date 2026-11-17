import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
const root = new URL('../../', import.meta.url),
  local = 'tools/ship-livery/',
  out = new URL(local + 'output/emblems/', root)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const paths = [
  'apps/web/src/features/empire-insignia.tsx',
  'apps/web/src/features/insignia.module.css',
  'apps/web/src/client-model/insignia-composer.ts',
  ...[
    'emblem-render.mjs',
    'emblem-authoring.mjs',
    'emblem-fixtures.ts',
    'emblem-viewer.tsx',
    'emblems.css',
    'export-emblems.mjs',
    'concord-emblems-v1/slots.json',
    'concord-emblems-v1/receiver.svg',
    'concord-finish-v2/finished-master.png',
    'finish-render.mjs',
    'output/finish/material-mask.png',
    'output/finish/response-map.png',
    ...['navy', 'rose', 'pearl', 'midnight'].map(
      (p) => 'output/finish/' + p + '.png',
    ),
  ].map((p) => local + p),
  ...[
    'forge-wayfinder',
    'forge-starwing',
    'forge-ascendant',
    'forge-helix',
    'forge-crown',
    'forge-moons',
    'forge-diagonal-stars',
    'alliance-horizon-bands',
    'alliance-chevron-bands',
  ].map((id) => `crates/application/assets/insignias/${id}.svg`),
]
const inputs = await Promise.all(
  paths.sort().map(async (path) => ({
    path,
    sha256: digest(await readFile(new URL(path, root))),
  })),
)
const outputs = await Promise.all(
  (await readdir(out))
    .filter((p) => p.endsWith('.png'))
    .sort()
    .map(async (path) => {
      const bytes = await readFile(new URL(path, out)),
        { width, height } = await sharp(bytes).metadata()
      return { path, width, height, sha256: digest(bytes) }
    }),
)
await writeFile(
  new URL('manifest.json', out),
  JSON.stringify(
    {
      renderer: 'concord-emblem-paint-v1',
      composition:
        'actual EmpireInsignia + compositionAppearance, static no treatment effects',
      recipeSource:
        'emblem-fixtures.ts: public bundled art; valid v2 literal-color recipes under unrestricted composition policy',
      inputs,
      outputs,
      versions: {
        node: process.version,
        sharp: sharp.versions.sharp,
        ...JSON.parse(
          await readFile(new URL('browser-verification.json', out)),
        ),
      },
      identityContract:
        'Production bake identity must hash all pixel-affecting inputs (including immutable emblem recipe/art/composer, treatment, placement, paint and output format); account and universe are not raster inputs. This manifest records a proof batch, not the implemented production cache.',
    },
    null,
    2,
  ) + '\n',
)
console.log('Wrote source, renderer, recipe-art and output hashes')
