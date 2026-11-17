import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import {
  assetPath,
  validateAssetReference,
  MAX_ASSET_BYTES,
  validateManifest,
} from '../../packages/ship-appearance/validation.mjs'
import {
  checkedAssetBytes,
  appearanceAssetUrls,
} from '../../packages/ship-appearance/assets.mjs'
import {
  decodePackagePng,
  validatePackagePngHeader,
} from '../../packages/ship-appearance/png.mjs'
async function boundedFile(path, max, signal) {
  signal?.throwIfAborted()
  const info = await stat(path)
  if (!info.isFile() || info.size > max)
    throw Error('Installed file exceeds bound')
  const bytes = await readFile(path, { signal })
  if (bytes.length > max) throw Error('Installed file exceeds bound')
  return bytes
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const packageRoot = new URL(
  '../../apps/web/public/art/ship-skins/',
  import.meta.url,
).pathname
async function readPackageManifest(id, revision, root) {
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(revision)
  )
    throw Error('Invalid package identity')
  const directory = join(root, id, revision)
  const manifestBytes = await boundedFile(
    join(directory, 'manifest.json'),
    32768,
  )
  if (manifestBytes.length > 32768) throw Error('Manifest too large')
  const manifest = validateManifest(JSON.parse(manifestBytes))
  if (manifest.id !== id || manifest.revision !== revision)
    throw Error('Installed package identity mismatch')
  return { directory, manifest }
}
async function packageMapBytes(directory, manifest, map, signal) {
  const bytes = await boundedFile(join(directory, map.file), map.bytes, signal)
  if (bytes.length !== map.bytes || digest(bytes) !== map.sha256)
    throw Error('Installed map hash mismatch')
  validatePackagePngHeader(bytes, manifest.width, manifest.height)
  return bytes
}
async function decodeInstalledPackage({ directory, manifest }, signal) {
  const asset = { manifest: structuredClone(manifest) }
  for (const [key, map] of Object.entries(manifest.maps)) {
    const bytes = await packageMapBytes(directory, manifest, map, signal)
    asset[key] = await decodePackagePng(bytes, manifest.width, manifest.height)
    signal?.throwIfAborted()
  }
  return asset
}
export async function loadPackage(id, revision, root = packageRoot) {
  return decodeInstalledPackage(await readPackageManifest(id, revision, root))
}

export async function bundledAssets(
  directory = new URL(
    '../../crates/application/assets/insignias/',
    import.meta.url,
  ).pathname,
) {
  const assets = new Map()
  for (const file of await readdir(directory)) {
    if (!/^[a-z0-9-]+\.svg$/.test(file)) continue
    const bytes = await boundedFile(join(directory, file), MAX_ASSET_BYTES)
    assets.set(
      `/api/media/insignias/${file.slice(0, -4)}/${digest(bytes)}.svg`,
      bytes,
    )
  }
  return assets
}
export function isPublicAddress(address) {
  const kind = isIP(address)
  if (kind === 4) {
    const [a, b] = address.split('.').map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  // Only global unicast IPv6. Reject IPv4 mapped, loopback, ULA, link local,
  // multicast and transition ranges that could conceal a private IPv4 target.
  return (
    kind === 6 && /^2[0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address)
  )
}
async function trustedFetch(url, config, signal) {
  const entries = await lookup(url.hostname.replace(/^\[|\]$/g, ''), {
    all: true,
  })
  if (
    !entries.length ||
    (!config.allowPrivate &&
      entries.some((entry) => !isPublicAddress(entry.address)))
  )
    throw Error('Asset origin resolves to a private or reserved address')
  const pinned = entries[0]
  return new Promise((resolvePromise, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        signal,
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [pinned])
            : callback(null, pinned.address, pinned.family),
        headers: config.token
          ? { authorization: `Bearer ${config.token}` }
          : {},
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume()
          reject(Error('Trusted asset fetch failed'))
          return
        }
        let total = 0
        const chunks = []
        response.on('data', (chunk) => {
          total += chunk.length
          if (total > MAX_ASSET_BYTES) {
            response.destroy(Error('Asset too large'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => resolvePromise(Buffer.concat(chunks)))
        response.on('error', reject)
      },
    )
    request.on('error', reject)
  })
}
export function assetConfig(env = process.env) {
  const origin = env.ORBIT_SHIP_ASSET_ORIGIN
    ? new URL(env.ORBIT_SHIP_ASSET_ORIGIN)
    : null
  if (
    origin &&
    (!['https:', 'http:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash)
  )
    throw Error('Configure an exact game asset origin')
  if (
    origin?.protocol === 'http:' &&
    env.ORBIT_SHIP_ASSET_ALLOW_PRIVATE !== 'true'
  )
    throw Error(
      'Plain HTTP is only allowed for explicitly configured private game service',
    )
  return {
    origin: origin?.origin,
    token: env.ORBIT_SHIP_ASSET_TOKEN,
    directory: env.ORBIT_SHIP_ASSET_DIRECTORY
      ? resolve(env.ORBIT_SHIP_ASSET_DIRECTORY)
      : null,
    allowPrivate: env.ORBIT_SHIP_ASSET_ALLOW_PRIVATE === 'true',
  }
}
export async function resolveEmblemAssets(appearance, bundled, config, signal) {
  const assets = {}
  for (const reference of appearanceAssetUrls(appearance)) {
    const url = validateAssetReference(reference)
    if (!reference.startsWith('/') && url.origin !== config.origin)
      throw Error('Untrusted insignia origin')
    const [, id, hash] = url.pathname.match(assetPath)
    let bytes = bundled.get(url.pathname)
    if (!bytes && config.directory) {
      try {
        bytes = await boundedFile(
          join(config.directory, 'insignias', 'v1', id, hash + '.svg'),
          MAX_ASSET_BYTES,
        )
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    if (!bytes) {
      if (!config.origin) throw Error('Insignia original not installed')
      bytes = await trustedFetch(
        new URL(url.pathname, config.origin),
        config,
        signal,
      )
    }
    await checkedAssetBytes(bytes, reference)
    assets[reference] = 'data:image/svg+xml;base64,' + bytes.toString('base64')
  }
  return assets
}

export function packageSelection(env = process.env) {
  const text =
    env.ORBIT_SHIP_PACKAGES ??
    '[{"id":"orbit-light-fighter","revision":"concord-v1"}]'
  if (text.length > 16384) throw Error('Installed package registry too large')
  const entries = JSON.parse(text)
  if (!Array.isArray(entries) || !entries.length || entries.length > 32)
    throw Error('Install one to thirty-two package revisions')
  const keys = new Set()
  for (const entry of entries) {
    if (
      !entry ||
      Object.keys(entry).some((key) => !['id', 'revision'].includes(key)) ||
      ![entry.id, entry.revision].every(
        (value) =>
          typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value),
      )
    )
      throw Error('Invalid installed package selection')
    const key = entry.id + '/' + entry.revision
    if (keys.has(key)) throw Error('Duplicate installed package revision')
    keys.add(key)
  }
  return entries
}
export async function loadInstalledPackages(env = process.env) {
  const root = env.ORBIT_SHIP_PACKAGE_DIRECTORY
    ? resolve(env.ORBIT_SHIP_PACKAGE_DIRECTORY)
    : packageRoot
  const packages = new Map()
  for (const { id, revision } of packageSelection(env)) {
    const entry = await readPackageManifest(id, revision, root)
    // Read/hash one compressed map at a time. Readiness checks every installed
    // original without retaining decoded hull maps or allocating their pixels.
    for (const map of Object.values(entry.manifest.maps))
      await packageMapBytes(entry.directory, entry.manifest, map)
    packages.set(id + '/' + revision, entry)
  }
  return {
    size: packages.size,
    async load(key, signal) {
      const entry = packages.get(key)
      if (!entry) throw Error('Package revision is not installed')
      // Keep the startup manifest snapshot; recheck map bytes before every bake.
      // No decoded-package cache: the service admits only one active request.
      return decodeInstalledPackage(entry, signal)
    },
  }
}
