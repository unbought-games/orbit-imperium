import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repository = 'unbought-games/orbit-imperium'
export const image = `ghcr.io/${repository}`
export const source = `https://github.com/${repository}`
const accept = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

// Explicit credentials only: an anonymous check never reads Docker or gh credentials.
export async function registryClient(token, actor, request = fetch) {
  const headers = token
    ? {
        Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}`,
      }
    : {}
  const auth = await request(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`,
    { headers },
  )
  assert.ok(auth.ok, `Registry authentication failed: HTTP ${auth.status}`)
  const { token: bearer } = await auth.json()
  return async (path, missing = false) => {
    const response = await request(`https://ghcr.io/v2/${repository}/${path}`, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: accept },
    })
    if (missing && response.status === 404) return null
    assert.ok(response.ok, `Registry ${path}: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    if (path.split('/').at(-1).startsWith('sha256:'))
      assert.equal(
        digest,
        path.split('/').at(-1),
        'Registry content digest mismatch',
      )
    return { digest, body: JSON.parse(bytes.toString()) }
  }
}

export async function inspectRegistry(
  get,
  reference,
  sha,
  version,
  allowMissing = false,
) {
  const root = await get(`manifests/${reference}`, allowMissing)
  if (!root) return { platforms: {} }
  const entries = root.body.manifests || [{ digest: root.digest }]
  const platforms = {}
  for (const entry of entries) {
    const manifest = await get(`manifests/${entry.digest}`)
    const { body: config } = await get(`blobs/${manifest.body.config.digest}`)
    assert.equal(config.os, 'linux')
    assert.ok(
      ['amd64', 'arm64'].includes(config.architecture),
      'Unexpected image architecture',
    )
    if (entry.platform) {
      assert.equal(entry.platform.os, config.os)
      assert.equal(entry.platform.architecture, config.architecture)
    }
    assert.ok(!platforms[config.architecture], 'Duplicate image architecture')
    assert.equal(
      config.config.Labels['org.opencontainers.image.revision'],
      sha,
      'Version already names a different source revision',
    )
    assert.equal(
      config.config.Labels['org.opencontainers.image.source'],
      source,
    )
    assert.equal(
      config.config.Labels['org.opencontainers.image.version'],
      version,
    )
    platforms[config.architecture] = entry.digest
  }
  return { digest: root.digest, platforms }
}

export function publicationSources(existing, candidates) {
  // Preserve any already-published architecture when recovering a partial index.
  return ['amd64', 'arm64'].map((arch) => {
    const digest = existing.platforms[arch] || candidates[arch]
    assert.match(digest || '', /^sha256:[a-f0-9]{64}$/, `Missing ${arch} image`)
    return `${image}@${digest}`
  })
}

async function main() {
  const version = process.env.ORBIT_RELEASE_VERSION
  const sha = process.env.ORBIT_RELEASE_SHA
  assert.match(version || '', /^\d+\.\d+\.\d+$/)
  assert.match(sha || '', /^[a-f0-9]{40}$/)
  const get = await registryClient(
    process.env.REGISTRY_TOKEN,
    process.env.GITHUB_ACTOR,
  )
  let result = await inspectRegistry(
    get,
    version,
    sha,
    version,
    process.argv.includes('--publish'),
  )
  if (
    process.argv.includes('--publish') &&
    (!result.platforms.amd64 || !result.platforms.arm64)
  ) {
    const candidates = {}
    for (const arch of ['amd64', 'arm64']) {
      const candidate = await inspectRegistry(
        get,
        `${process.env.ORBIT_IMAGE_STAGING}-${arch}`,
        sha,
        version,
      )
      assert.deepEqual(Object.keys(candidate.platforms), [arch])
      candidates[arch] = candidate.platforms[arch]
    }
    execFileSync(
      'docker',
      [
        'buildx',
        'imagetools',
        'create',
        '--tag',
        `${image}:${version}`,
        ...publicationSources(result, candidates),
      ],
      { stdio: 'inherit' },
    )
    result = await inspectRegistry(get, version, sha, version)
  }
  assert.deepEqual(Object.keys(result.platforms).sort(), ['amd64', 'arm64'])
  const record = {
    image: `${image}:${version}`,
    source,
    revision: sha,
    digest: result.digest,
    platforms: result.platforms,
  }
  const text = JSON.stringify(record, null, 2) + '\n'
  writeFileSync('container-image.json', text)
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      '```json\n' + text + '```\n',
    )
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main()
