export const RENDERER_VERSION = 'finish-decal-v1'
export const MAX_REQUEST_BYTES = 32 * 1024
export const MAX_ASSET_BYTES = 64 * 1024
export const MAX_OUTPUT_BYTES = 24 * 1024 * 1024
const hex = {
  test: (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value),
}
const id = {
  test: (value) =>
    typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value),
}
export const assetPath =
  /^\/api\/media\/insignias\/([a-z0-9][a-z0-9-]{0,63})\/([a-f0-9]{64})\.svg$/
function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}
function object(value) {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Object required',
  )
}
function keys(value, allowed) {
  object(value)
  requireValue(
    Object.keys(value).every((key) => allowed.includes(key)),
    'Unexpected field',
  )
}
export function validateColors(colors) {
  keys(colors, ['primary', 'accent'])
  requireValue(
    hex.test(colors.primary) && hex.test(colors.accent),
    'Two resolved hex colors required',
  )
}
export function validatePlacement(treatment, placement) {
  requireValue(
    ['none', 'full', 'layers'].includes(treatment),
    'Unsupported emblem treatment',
  )
  requireValue(
    ['near-wing', 'paired'].includes(placement),
    'Unsupported emblem placement',
  )
}
export function validateAssetReference(value) {
  requireValue(
    typeof value === 'string' &&
      value.length <= 2048 &&
      !/[\\\s"'<>]/.test(value),
    'Invalid asset reference',
  )
  const url = new URL(value, 'https://installed.invalid')
  requireValue(
    ((value.startsWith('/') && !value.startsWith('//')) ||
      /^https?:\/\//.test(value)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      assetPath.test(url.pathname),
    'Only hash-addressed game insignias are allowed',
  )
  // URL normalization must not hide traversal or escaped path segments.
  requireValue(
    !value.includes('%') && !value.includes('/../') && !value.includes('/./'),
    'Invalid asset path',
  )
  return url
}
const recipeColor = (value) =>
  hex.test(value) ||
  (typeof value === 'string' &&
    value.startsWith('dye:') &&
    id.test(value.slice(4)))
function validateRecipe(recipe) {
  keys(recipe, [
    'version',
    'symbol',
    'foreground',
    'background',
    'layers',
    'shape',
    'finish',
    'effect',
  ])
  requireValue(
    [1, 2, 3].includes(recipe.version) && id.test(recipe.symbol),
    'Invalid insignia recipe',
  )
  for (const color of [recipe.foreground, recipe.background])
    requireValue(recipeColor(color), 'Invalid recipe color')
  requireValue(
    recipe.shape === undefined ||
      ['shield', 'circle', 'rounded_square', 'diamond', 'hexagon'].includes(
        recipe.shape,
      ),
    'Invalid shape',
  )
  for (const key of ['finish', 'effect'])
    requireValue(
      recipe[key] === undefined || id.test(recipe[key]),
      'Invalid treatment id',
    )
  if (recipe.layers !== undefined) {
    requireValue(
      Array.isArray(recipe.layers) && recipe.layers.length <= 4,
      'Too many recipe layers',
    )
    for (const layer of recipe.layers) {
      keys(layer, ['symbol', 'color'])
      requireValue(
        id.test(layer.symbol) && recipeColor(layer.color),
        'Invalid recipe layer',
      )
    }
  }
}
function validateTreatment(treatment) {
  if (treatment === null) return
  // Catalog metadata is inert. Rendering uses only bounded built-in families/parameters.
  object(treatment)
  requireValue(
    ['plain', 'surface', 'light', 'interaction'].includes(treatment.renderer),
    'Unsupported treatment renderer',
  )
  object(treatment.parameters)
  requireValue(
    Object.keys(treatment.parameters).length <= 12,
    'Too many treatment parameters',
  )
  for (const [key, value] of Object.entries(treatment.parameters)) {
    requireValue(
      [
        'pattern',
        'strength',
        'angle',
        'scale',
        'duration_ms',
        'depth',
      ].includes(key),
      'Unknown treatment parameter',
    )
    requireValue(
      key === 'pattern'
        ? id.test(value)
        : typeof value === 'number' &&
            Number.isFinite(value) &&
            Math.abs(value) <= 20000,
      'Invalid treatment parameter',
    )
  }
}
export function validateAppearance(appearance) {
  keys(appearance, ['recipe', 'asset_url', 'layers', 'rendering'])
  validateRecipe(appearance.recipe)
  validateAssetReference(appearance.asset_url)
  if (appearance.layers !== undefined) {
    requireValue(
      Array.isArray(appearance.layers) && appearance.layers.length <= 4,
      'Too many resolved layers',
    )
    for (const layer of appearance.layers) {
      keys(layer, ['symbol', 'color', 'asset_url'])
      requireValue(
        id.test(layer.symbol) && hex.test(layer.color),
        'Resolved layer color required',
      )
      validateAssetReference(layer.asset_url)
    }
  }
  if (appearance.rendering !== undefined) {
    keys(appearance.rendering, ['foreground', 'background', 'finish', 'effect'])
    requireValue(
      hex.test(appearance.rendering.foreground) &&
        hex.test(appearance.rendering.background),
      'Resolved insignia colors required',
    )
    validateTreatment(appearance.rendering.finish)
    validateTreatment(appearance.rendering.effect)
  } else
    requireValue(
      hex.test(appearance.recipe.foreground) &&
        hex.test(appearance.recipe.background),
      'Named dyes require authoritative rendering colors',
    )
}
export function validateRequest(request) {
  requireValue(
    JSON.stringify(request).length <= MAX_REQUEST_BYTES,
    'Request too large',
  )
  keys(request, [
    'version',
    'request_id',
    'package_id',
    'package_revision',
    'colors',
    'emblem',
  ])
  requireValue(
    request.version === 1 &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        request.request_id,
      ),
    'Unsupported version or request UUID',
  )
  requireValue(
    id.test(request.package_id) && id.test(request.package_revision),
    'Invalid package identity',
  )
  validateColors(request.colors)
  if (request.emblem !== null) {
    keys(request.emblem, ['recipe', 'appearance', 'treatment', 'placement'])
    validateRecipe(request.emblem.recipe)
    validateAppearance(request.emblem.appearance)
    validatePlacement(request.emblem.treatment, request.emblem.placement)
  }
  return request
}
export function validateManifest(manifest) {
  keys(manifest, [
    'version',
    'id',
    'revision',
    'renderer',
    'target',
    'collection_id',
    'view',
    'channels',
    'map_encoding',
    'color_space',
    'alpha',
    'capabilities',
    'width',
    'height',
    'reference',
    'maps',
    'slots',
    'paint',
    'license',
    'attribution',
    'provenance',
  ])
  requireValue(
    [manifest.license, manifest.attribution].every(
      (value) =>
        typeof value === 'string' && value.length > 0 && value.length <= 512,
    ),
    'Package attribution required',
  )
  object(manifest.provenance)
  requireValue(
    manifest.version === 1 &&
      manifest.renderer === RENDERER_VERSION &&
      id.test(manifest.id) &&
      id.test(manifest.revision),
    'Unsupported skin package',
  )
  keys(manifest.target, ['kind', 'id'])
  requireValue(
    ['Ship', 'Defense', 'Building'].includes(manifest.target.kind) &&
      typeof manifest.target.id === 'string' &&
      /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(manifest.target.id),
    'Invalid package target',
  )
  requireValue(
    id.test(manifest.collection_id) && id.test(manifest.view),
    'Invalid package collection/view',
  )
  requireValue(
    JSON.stringify(manifest.channels) === '["primary","accent"]' &&
      manifest.map_encoding === 'rgba8-finish-decal-v1' &&
      manifest.color_space === 'srgb' &&
      manifest.alpha === 'straight-preserved',
    'Unsupported package channel/encoding contract',
  )
  keys(manifest.capabilities, ['treatments', 'placements'])
  requireValue(
    JSON.stringify(manifest.capabilities.treatments) ===
      '["none","full","layers"]' &&
      JSON.stringify(manifest.capabilities.placements) ===
        '["near-wing","paired"]',
    'Unsupported package capabilities',
  )
  requireValue(
    Number.isInteger(manifest.width) &&
      Number.isInteger(manifest.height) &&
      manifest.width > 0 &&
      manifest.height > 0 &&
      manifest.width <= 2048 &&
      manifest.height <= 2048,
    'Invalid package dimensions',
  )
  requireValue(
    Array.isArray(manifest.reference) &&
      manifest.reference.length === 2 &&
      manifest.reference.every((v) => hex.test(v)),
    'Invalid reference colors',
  )
  keys(manifest.maps, [
    'source',
    'material',
    'response',
    'receiver',
    'decalResponse',
  ])
  for (const key of [
    'source',
    'material',
    'response',
    'receiver',
    'decalResponse',
  ]) {
    const map = manifest.maps[key]
    keys(map, ['file', 'sha256', 'bytes'])
    requireValue(
      /^[a-z][a-z0-9-]*\.png$/.test(map.file) &&
        /^[a-f0-9]{64}$/.test(map.sha256) &&
        Number.isInteger(map.bytes) &&
        map.bytes > 0 &&
        map.bytes <= 16 * 1024 * 1024,
      'Invalid package map',
    )
  }
  requireValue(
    Array.isArray(manifest.slots) &&
      manifest.slots.length >= 1 &&
      manifest.slots.length <= 4 &&
      manifest.slots[0].id === 'near-wing',
    'Invalid decal slots',
  )
  for (const slot of manifest.slots) {
    requireValue(
      id.test(slot.id) && Array.isArray(slot.quad) && slot.quad.length === 4,
      'Invalid decal surface',
    )
    for (const point of slot.quad)
      requireValue(
        Array.isArray(point) &&
          point.length === 2 &&
          point.every(
            (v, i) =>
              Number.isFinite(v) &&
              v >= 0 &&
              v <= [manifest.width, manifest.height][i],
          ),
        'Invalid surface point',
      )
    // Consistent nonzero cross products reject self-intersection/degenerate quads.
    const crosses = slot.quad.map((a, i) => {
      const b = slot.quad[(i + 1) % 4],
        c = slot.quad[(i + 2) % 4]
      return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    })
    requireValue(
      crosses.every((v) => v > 1e-6) || crosses.every((v) => v < -1e-6),
      'Degenerate decal surface',
    )
  }
  keys(manifest.paint, ['opacity', 'responseFloor', 'responseCeiling'])
  requireValue(
    Number.isFinite(manifest.paint.opacity) &&
      manifest.paint.opacity >= 0 &&
      manifest.paint.opacity <= 1 &&
      Number.isFinite(manifest.paint.responseFloor) &&
      Number.isFinite(manifest.paint.responseCeiling) &&
      manifest.paint.responseFloor >= 0 &&
      manifest.paint.responseFloor <= manifest.paint.responseCeiling &&
      manifest.paint.responseCeiling <= 5,
    'Invalid paint response',
  )
  return manifest
}
