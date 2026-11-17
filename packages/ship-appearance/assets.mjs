import { MAX_ASSET_BYTES, validateAssetReference } from './validation.mjs'
export async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('')
}
export async function checkedAssetBytes(bytes, reference) {
  if (bytes.byteLength > MAX_ASSET_BYTES)
    throw Error('Insignia asset too large')
  const expected = validateAssetReference(reference).pathname.match(
    /\/([a-f0-9]{64})\.svg$/,
  )[1]
  if ((await sha256(bytes)) !== expected)
    throw Error('Insignia asset hash mismatch')
  const svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  // Defense in depth beyond the game catalog's static SVG validation. No active
  // XML, CSS, external resource, embedded document or href is sent to the browser.
  if (
    !/^\s*<svg[\s>]/.test(svg) ||
    /<!|<\?|&|\b(?:href|style|on[a-z]+)\s*=|url\s*\(/i.test(svg)
  )
    throw Error('Unsafe SVG content')
  for (const tag of svg.matchAll(/<\/?\s*([\w:-]+)/g))
    if (
      ![
        'svg',
        'g',
        'path',
        'circle',
        'ellipse',
        'rect',
        'polygon',
        'polyline',
        'line',
        'title',
        'desc',
      ].includes(tag[1])
    )
      throw Error('Unsupported SVG element')
  return svg
}
export function appearanceAssetUrls(appearance) {
  return [
    ...new Set([
      appearance.asset_url,
      ...(appearance.layers ?? []).map((layer) => layer.asset_url),
    ]),
  ]
}
export function withEmbeddedAssets(appearance, assets) {
  const replace = (url) => {
    const data = assets[url]
    if (!data?.startsWith('data:image/svg+xml;base64,'))
      throw Error('Missing verified insignia asset')
    return data
  }
  return {
    ...appearance,
    asset_url: replace(appearance.asset_url),
    ...(appearance.layers
      ? {
          layers: appearance.layers.map((layer) => ({
            ...layer,
            asset_url: replace(layer.asset_url),
          })),
        }
      : {}),
  }
}
