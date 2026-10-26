import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inspectRegistry,
  publicationSources,
  registryClient,
  source,
  image,
} from './release-registry.mjs'

const sha = 'a'.repeat(40)
const digest = (n) => `sha256:${String(n).repeat(64)}`
function fixture(architectures = ['amd64', 'arm64']) {
  const objects = new Map()
  const entries = architectures.map((architecture, i) => {
    const entry = {
      digest: digest(i + 1),
      platform: { os: 'linux', architecture },
    }
    objects.set(`manifests/${entry.digest}`, {
      body: { config: { digest: digest(i + 3) } },
    })
    objects.set(`blobs/${digest(i + 3)}`, {
      body: {
        os: 'linux',
        architecture,
        config: {
          Labels: {
            'org.opencontainers.image.revision': sha,
            'org.opencontainers.image.source': source,
            'org.opencontainers.image.version': '0.4.0',
          },
        },
      },
    })
    return entry
  })
  objects.set('manifests/0.4.0', {
    digest: digest(5),
    body: { manifests: entries },
  })
  return {
    objects,
    get: async (path) => {
      assert.ok(objects.has(path), path)
      return objects.get(path)
    },
  }
}

test('verifies both platform configurations, revision, source and version', async () => {
  const { get } = fixture()
  assert.deepEqual(await inspectRegistry(get, '0.4.0', sha, '0.4.0'), {
    digest: digest(5),
    platforms: { amd64: digest(1), arm64: digest(2) },
  })
})

test('rejects conflicting revision, source, version, duplicate or misleading platforms', async () => {
  for (const label of ['revision', 'source', 'version']) {
    const { get, objects } = fixture()
    objects.get(`blobs/${digest(4)}`).body.config.Labels[
      `org.opencontainers.image.${label}`
    ] = 'wrong'
    await assert.rejects(inspectRegistry(get, '0.4.0', sha, '0.4.0'))
  }
  const duplicate = fixture(['amd64', 'amd64'])
  await assert.rejects(
    inspectRegistry(duplicate.get, '0.4.0', sha, '0.4.0'),
    /Duplicate/,
  )
  const misleading = fixture()
  misleading.objects.get(`blobs/${digest(4)}`).body.architecture = 'amd64'
  await assert.rejects(inspectRegistry(misleading.get, '0.4.0', sha, '0.4.0'))
})

test('recovery retains already published architecture digests', async () => {
  const { get } = fixture(['amd64'])
  const existing = await inspectRegistry(get, '0.4.0', sha, '0.4.0')
  assert.deepEqual(
    publicationSources(existing, { amd64: digest(8), arm64: digest(9) }),
    [`${image}@${digest(1)}`, `${image}@${digest(9)}`],
  )
  assert.throws(
    () => publicationSources({ platforms: {} }, { amd64: digest(1) }),
    /Missing arm64/,
  )
  const missing = await inspectRegistry(
    async (_, allowMissing) => {
      assert.equal(allowMissing, true)
      return null
    },
    '0.4.0',
    sha,
    '0.4.0',
    true,
  )
  assert.deepEqual(missing, { platforms: {} })
})

test('anonymous client supplies no account credentials, distinguishes absent tags from access failures', async () => {
  const calls = []
  const request = async (url, options) => {
    calls.push({ url, options })
    return calls.length === 1
      ? Response.json({ token: 'anonymous-bearer' })
      : new Response('', { status: 404 })
  }
  const get = await registryClient(undefined, undefined, request)
  assert.deepEqual(calls[0].options.headers, {})
  assert.equal(await get('manifests/0.4.0', true), null)
  await assert.rejects(get('manifests/0.4.0'), /404/)
  assert.equal(
    calls[1].options.headers.Authorization,
    'Bearer anonymous-bearer',
  )
  await assert.rejects(
    registryClient(
      undefined,
      undefined,
      async () => new Response('', { status: 403 }),
    ),
    /authentication failed: HTTP 403/,
  )
  let count = 0
  const denied = await registryClient('secret', 'actor', async (_, options) => {
    if (count++ === 0) {
      assert.equal(
        options.headers.Authorization,
        `Basic ${Buffer.from('actor:secret').toString('base64')}`,
      )
      return Response.json({ token: 'bearer' })
    }
    return new Response('', { status: 403 })
  })
  await assert.rejects(denied('manifests/0.4.0', true), /403/)
})

test('rejects content that does not match its digest', async () => {
  let count = 0
  const get = await registryClient(undefined, undefined, async () =>
    Response.json(count++ === 0 ? { token: 'bearer' } : {}),
  )
  await assert.rejects(get(`blobs/${digest(1)}`), /digest mismatch/)
})

test('release workflow gates publication on both native inspections and keeps backfill source separate', async () => {
  const { readFileSync } = await import('node:fs')
  const { load } = await import('js-yaml')
  const workflow = load(
    readFileSync('.github/workflows/publish-release.yml', 'utf8'),
  )
  const { prepare, build, publish } = workflow.jobs
  assert.deepEqual(Object.keys(workflow.on), [
    'workflow_run',
    'push',
    'workflow_dispatch',
  ])
  assert.match(prepare.if, /github.ref == 'refs\/heads\/main'/)
  assert.equal(build.if, "needs.prepare.outputs.release == 'true'")
  assert.deepEqual(publish.needs, ['prepare', 'build'])
  assert.equal(build.permissions.packages, 'write')
  assert.equal(build.permissions.contents, 'read')
  assert.equal(publish.permissions.packages, 'write')
  assert.equal(prepare.permissions.packages, undefined)
  const buildIndex = build.steps.findIndex((s) =>
    s.run?.includes('make inspect-release-image'),
  )
  assert.ok(
    buildIndex > 0 &&
      buildIndex < build.steps.findIndex((s) => s.run?.includes('docker push')),
  )
  for (const job of [build, publish]) {
    const checkouts = job.steps.filter((s) =>
      s.uses?.startsWith('actions/checkout@'),
    )
    assert.equal(checkouts[0].with.ref, '${{ github.sha }}')
    assert.equal(checkouts[1].with.ref, '${{ needs.prepare.outputs.sha }}')
    assert.equal(checkouts[1].with.path, 'source')
  }
  const anonymous = publish.steps.find(
    (s) => s.run === 'make verify-release-registry',
  )
  assert.ok(anonymous)
  assert.equal(anonymous.env, undefined)
  assert.equal(publish.env.REGISTRY_TOKEN, undefined)
  assert.equal(workflow.env.REGISTRY_TOKEN, undefined)
  // GitHub retries only failed matrix jobs; successful builds keep their tags.
  // Resolve the actual producer/consumer templates across different attempts.
  const expand = (template, arch, attempt) =>
    template
      .replaceAll('${{ github.run_id }}', '1234')
      .replaceAll('${{ github.run_attempt }}', String(attempt))
      .replaceAll('${{ matrix.arch }}', arch)
  for (const arch of ['amd64', 'arm64']) {
    const successfulBuild = expand(build.env.ORBIT_RELEASE_IMAGE, arch, 1)
    const retryConsumer = `${image}:${expand(publish.env.ORBIT_IMAGE_STAGING, arch, 2)}-${arch}`
    assert.equal(successfulBuild, retryConsumer)
  }
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
})
