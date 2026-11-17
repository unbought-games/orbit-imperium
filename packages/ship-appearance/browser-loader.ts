import { decodePackagePng } from './png.mjs'
import {
  validateManifest,
  validateAppearance,
  validateAssetReference,
} from './validation.mjs'
import { sha256, checkedAssetBytes, appearanceAssetUrls } from './assets.mjs'
import type { ShipPackage, PackageManifest, InsigniaAppearance } from './types'
import type { ShipSkin } from '../../apps/web/src/client-model/ship-appearance-types'

async function boundedFetch(url: string, max: number, signal?: AbortSignal) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  })
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get('content-length')) > max
  )
    throw Error('Artwork unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > max) throw Error('Artwork exceeds size bound')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result.buffer
}
export async function loadShipPackage(
  skin: ShipSkin,
  signal?: AbortSignal,
): Promise<ShipPackage> {
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(skin.id) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(skin.package_revision)
  )
    throw Error('Invalid skin identity')
  const base = `/art/ship-skins/${skin.id}/${skin.package_revision}/`
  if (skin.package_url !== base + 'manifest.json')
    throw Error('Skin package must be installed')
  const bytes = await boundedFetch(skin.package_url, 32 * 1024, signal)
  const manifest: PackageManifest = validateManifest(
    JSON.parse(new TextDecoder().decode(bytes)),
  )
  if (manifest.id !== skin.id || manifest.revision !== skin.package_revision)
    throw Error('Skin package identity mismatch')
  const maps = await Promise.all(
    Object.entries(manifest.maps).map(async ([key, map]) => {
      const bytes = await boundedFetch(base + map.file, map.bytes, signal)
      if (
        bytes.byteLength !== map.bytes ||
        (await sha256(bytes)) !== map.sha256
      )
        throw Error('Skin package hash mismatch')
      return [
        key,
        await decodePackagePng(bytes, manifest.width, manifest.height),
      ]
    }),
  )
  return { manifest, ...Object.fromEntries(maps) } as ShipPackage
}
export async function loadEmblemAssets(
  appearance: InsigniaAppearance,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  validateAppearance(appearance)
  const pairs = await Promise.all(
    appearanceAssetUrls(appearance).map(async (reference) => {
      validateAssetReference(reference)
      const url = new URL(reference, location.origin)
      // Game media is same-origin; cross-origin asset backends stay server-side.
      if (url.origin !== location.origin)
        throw Error('Insignia must use installed game media')
      const bytes = await boundedFetch(url.href, 64 * 1024, signal)
      await checkedAssetBytes(bytes, reference)
      return [
        reference,
        'data:image/svg+xml;base64,' +
          btoa(String.fromCharCode(...new Uint8Array(bytes))),
      ]
    }),
  )
  return Object.fromEntries(pairs)
}

export function installedPreviewUrl(skin: ShipSkin): string | undefined {
  const identifier = /^[a-z0-9][a-z0-9-]{0,63}$/
  if (!identifier.test(skin.id) || !identifier.test(skin.package_revision))
    return undefined
  const base = `/art/ship-skins/${skin.id}/${skin.package_revision}/`
  if (
    !skin.preview_url.startsWith(base) ||
    !/^[a-z0-9-]+\.(png|webp)$/.test(skin.preview_url.slice(base.length))
  )
    return undefined
  return skin.preview_url
}
