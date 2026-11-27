import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import yaml from 'js-yaml'
import { verifyRelease, verifyReleaseFromGitHub } from './release-gate.mjs'

function fixture(branch = 'main') {
  const sha = 'a'.repeat(40)
  const run = {
    id: 123,
    run_attempt: 1,
    workflow_id: 456,
    repository: { id: 1427640162 },
    head_repository: { id: 1427640162 },
    event: 'push',
    head_branch: branch,
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
  }
  return {
    event: {
      repository: {
        id: 1427640162,
        full_name: 'unbought-games/orbit-imperium',
      },
      workflow_run: structuredClone(run),
    },
    run,
    workflow: { id: 456, path: '.github/workflows/ci.yml', state: 'active' },
    jobs: [
      {
        name: 'Build, lint and unit tests',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
      },
    ],
    branchSha: sha,
    comparison: {
      base_commit: { sha },
      merge_base_commit: { sha },
      status: 'identical',
    },
  }
}

test('releases the selected revision with its successful aggregate check and main ancestry', () => {
  const input = fixture()
  assert.equal(verifyRelease(input), input.branchSha)
})

test('rejects forks, other branches/events/workflows, unrelated revisions, reruns and incomplete CI', () => {
  const mutations = [
    (x) => {
      x.event.repository.id = 1
    },
    (x) => {
      x.event.repository.full_name = 'other/repo'
    },
    (x) => {
      x.run.repository.id = 1
    },
    (x) => {
      x.run.head_repository.id = 1
    },
    (x) => {
      x.event.workflow_run.head_repository.id = 1
    },
    (x) => {
      x.run.event = 'pull_request'
    },
    (x) => {
      x.run.event = 'workflow_dispatch'
    },
    (x) => {
      x.run.event = 'merge_group'
      x.event.workflow_run.event = 'merge_group'
    },
    (x) => {
      x.run.head_branch = 'feature'
    },
    (x) => {
      x.run.conclusion = 'failure'
    },
    (x) => {
      x.run.status = 'in_progress'
    },
    (x) => {
      x.comparison.status = 'diverged'
    },
    (x) => {
      x.comparison.status = 'behind'
    },
    (x) => {
      x.comparison.merge_base_commit.sha = 'b'.repeat(40)
    },
    (x) => {
      x.comparison.base_commit.sha = 'b'.repeat(40)
    },
    (x) => {
      x.expectedAttempt = 2
    },
    (x) => {
      x.event.workflow_run.head_sha = 'b'.repeat(40)
    },
    (x) => {
      x.run.run_attempt = 2
    },
    (x) => {
      x.run.id = 999
    },
    (x) => {
      x.run.workflow_id = 789
    },
    (x) => {
      x.workflow.path = '.github/workflows/other.yml'
    },
    (x) => {
      x.workflow.state = 'disabled_manually'
    },
    (x) => {
      x.jobs = []
    },
    (x) => {
      x.jobs.push({ ...x.jobs[0] })
    },
    (x) => {
      x.jobs[0].head_sha = 'b'.repeat(40)
    },
    (x) => {
      x.jobs[0].conclusion = 'skipped'
    },
    (x) => {
      x.jobs[0].conclusion = 'failure'
    },
    (x) => {
      x.jobs[0].status = 'queued'
    },
  ]
  for (const mutate of mutations) {
    const input = fixture()
    mutate(input)
    assert.throws(() => verifyRelease(input), undefined, mutate.toString())
  }
})

test('release workflow keeps PRs and explicit suites outside the privileged publication path', () => {
  const read = (name) =>
    yaml.load(
      readFileSync(
        new URL(`../.github/workflows/${name}.yml`, import.meta.url),
        'utf8',
      ),
    )
  const release = read('release-image')
  assert.deepEqual(Object.keys(release.on), [
    'workflow_run',
    'workflow_dispatch',
  ])
  assert.equal(release.on.workflow_dispatch.inputs.commit.required, true)
  assert.deepEqual(release.on.workflow_run, {
    workflows: ['CI'],
    types: ['completed'],
    branches: ['main', 'prod/S001'],
  })
  assert.equal(release.concurrency['cancel-in-progress'], false)
  assert.equal(
    release.concurrency.group,
    'release-image-${{ inputs.source_branch || github.event.workflow_run.head_branch }}-${{ inputs.commit || github.event.workflow_run.head_sha }}',
  )
  assert.deepEqual(release.permissions, { contents: 'read' })
  assert.equal(release.jobs.trusted.permissions['id-token'], undefined)
  assert.deepEqual(
    release.on.workflow_dispatch.inputs.source_branch.options,
    release.on.workflow_run.branches,
  )
  assert.equal(
    release.on.workflow_dispatch.inputs.source_branch.default,
    'main',
  )
  assert.equal(release.jobs.build.permissions['id-token'], undefined)
  assert.equal(release.jobs.build.needs, 'trusted')
  assert.deepEqual(release.jobs.publish.needs, ['trusted', 'build'])
  const buildSteps = release.jobs.build.steps
  assert.equal(buildSteps[0].with.ref, '${{ needs.trusted.outputs.sha }}')
  assert.ok(
    buildSteps.some((step) => step.run === 'make inspect-release-image'),
  )
  assert.equal(
    release.jobs.build.outputs.image_artifact,
    '${{ steps.save.outputs.artifact-id }}',
  )
  const steps = release.jobs.publish.steps
  assert.equal(steps[0].with.ref, '${{ github.sha }}')
  assert.equal(
    steps[1].with['artifact-ids'],
    '${{ needs.build.outputs.image_artifact }}',
  )
  assert.equal(
    release.jobs.publish.env.ORBIT_SOURCE_BRANCH,
    '${{ needs.trusted.outputs.source_branch }}',
  )
  const auth = steps.findIndex((step) => step.uses?.startsWith('aws-actions/'))
  assert.ok(auth > 1)
  assert.equal(steps[auth - 1].run, 'node scripts/release-gate.mjs')
  assert.equal(
    release.jobs.publish.env.ORBIT_CI_RUN_ID,
    '${{ needs.trusted.outputs.ci_run }}',
  )
  assert.equal(
    release.jobs.publish.env.ORBIT_CI_RUN_ATTEMPT,
    '${{ needs.trusted.outputs.ci_attempt }}',
  )
  assert.equal(steps.at(-1).with.path, 'release-image.json')
  for (const job of Object.values(release.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04')
    for (const step of job.steps) {
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/)
      if (step.uses?.startsWith('actions/checkout'))
        assert.equal(step.with['persist-credentials'], false)
      assert.doesNotMatch(
        step.run ?? '',
        /test-container|container-smoke|test-explicit|test-acceptance/,
      )
    }
  }
  assert.deepEqual(Object.keys(read('explicit-tests').on), [
    'workflow_dispatch',
  ])
  const ci = read('ci')
  assert.deepEqual(ci.on.push.branches, release.on.workflow_run.branches)
  const numbered = read('publish-release')
  assert.deepEqual(numbered.on.workflow_run.branches, ['main'])
  const prepare = numbered.jobs.prepare.steps
  const ancestry = prepare.findIndex(
    (step) =>
      step.run === 'git merge-base --is-ancestor HEAD refs/remotes/origin/main',
  )
  const select = prepare.findIndex((step) => step.id === 'select')
  assert.ok(ancestry >= 0 && ancestry < select)
  assert.equal(prepare[ancestry]['working-directory'], 'source')
  assert.deepEqual(ci.permissions, { contents: 'read' })
  assert.equal(
    ci.concurrency['cancel-in-progress'],
    "${{ github.event_name == 'pull_request' }}",
  )
  assert.equal(
    ci.concurrency.group,
    "${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}-${{ github.event_name != 'pull_request' && github.sha || '' }}",
  )
  for (const job of Object.values(ci.jobs))
    assert.equal(job.permissions?.['id-token'], undefined)
})

test('new main commits do not supersede the selected automatic or manual publication', () => {
  for (const manual of [false, true]) {
    const input = fixture()
    const sha = input.run.head_sha
    if (manual) {
      delete input.event.workflow_run
      input.event.inputs = { commit: sha }
    }
    for (const branchSha of ['b'.repeat(40), 'c'.repeat(40)]) {
      input.branchSha = branchSha
      input.comparison.status = 'ahead'
      assert.equal(verifyRelease(input), sha)
    }
  }
})

test('manual selection rejects missing/abbreviated commits and mismatched CI evidence', () => {
  for (const commit of [undefined, 'main', 'abc123', 'b'.repeat(40)]) {
    const input = fixture()
    delete input.event.workflow_run
    input.event.inputs = { commit }
    assert.throws(() => verifyRelease(input))
  }
})

function apiFixture(input, overrides = {}) {
  const calls = []
  const fetch = async (url) => {
    const path = url.split('/orbit-imperium/')[1]
    calls.push(path)
    let value
    if (path.startsWith('actions/workflows/ci.yml/runs?'))
      value = { workflow_runs: [input.run] }
    else if (path === `actions/runs/${input.run.id}`) value = input.run
    else if (path === 'actions/workflows/ci.yml') value = input.workflow
    else if (path.startsWith('git/ref/heads/'))
      value = { object: { sha: input.branchSha } }
    else if (
      path === `actions/runs/${input.run.id}/attempts/1/jobs?per_page=100`
    )
      value = { total_count: input.jobs.length, jobs: input.jobs }
    else if (path === `compare/${input.run.head_sha}...${input.branchSha}`)
      value = input.comparison
    else throw Error('Unexpected API request: ' + path)
    if (Object.hasOwn(overrides, path)) value = overrides[path]
    return {
      ok: value !== null,
      status: value === null ? 404 : 200,
      json: async () => structuredClone(value),
    }
  }
  return { fetch, calls }
}

test('manual dispatch discovers CI once and pins the same run and attempt across a main advance', async () => {
  const input = fixture()
  delete input.event.workflow_run
  input.event.inputs = { commit: input.run.head_sha }
  input.branchSha = 'b'.repeat(40)
  input.comparison.status = 'ahead'
  const api = apiFixture(input)
  const selected = await verifyReleaseFromGitHub(input.event, 'fixture', api)
  assert.deepEqual(selected, {
    sha: input.run.head_sha,
    branch: 'main',
    ciRun: 123,
    ciAttempt: 1,
  })
  input.branchSha = 'c'.repeat(40)
  const recheck = apiFixture(input)
  assert.deepEqual(
    await verifyReleaseFromGitHub(input.event, 'fixture', {
      ...recheck,
      ciRun: selected.ciRun,
      ciAttempt: selected.ciAttempt,
    }),
    selected,
  )
  assert.ok(!recheck.calls.some((path) => path.includes('/runs?')))
  assert.ok(
    recheck.calls.includes('actions/runs/123/attempts/1/jobs?per_page=100'),
  )
})

test('API gate fails closed on missing CI, partial job evidence, changed attempts and lost ancestry', async () => {
  const input = fixture()
  delete input.event.workflow_run
  input.event.inputs = { commit: input.run.head_sha }
  const listing = `actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${input.run.head_sha}&status=success&per_page=100`
  for (const overrides of [
    { [listing]: { workflow_runs: [] } },
    { 'actions/runs/123': { ...input.run, run_attempt: 2 } },
    {
      'actions/runs/123/attempts/1/jobs?per_page=100': {
        total_count: 2,
        jobs: input.jobs,
      },
    },
    {
      [`compare/${input.run.head_sha}...${input.branchSha}`]: {
        ...input.comparison,
        status: 'diverged',
      },
    },
    { [`compare/${input.run.head_sha}...${input.branchSha}`]: null },
  ])
    await assert.rejects(
      verifyReleaseFromGitHub(
        input.event,
        'fixture',
        apiFixture(input, overrides),
      ),
    )
})

test('seasonal publication binds CI and ancestry to the exact branch even when main has the same commit', async () => {
  for (const manual of [false, true]) {
    const input = fixture('prod/S001')
    if (manual) {
      delete input.event.workflow_run
      input.event.inputs = {
        commit: input.run.head_sha,
        source_branch: 'prod/S001',
      }
    }
    const api = apiFixture(input)
    const result = await verifyReleaseFromGitHub(input.event, 'fixture', api)
    assert.equal(result.branch, 'prod/S001')
    assert.ok(api.calls.includes('git/ref/heads/prod/S001'))
    if (manual)
      assert.ok(api.calls.some((path) => path.includes('branch=prod%2FS001&')))
    input.run.head_branch = 'main'
    await assert.rejects(verifyReleaseFromGitHub(input.event, 'fixture', api))
  }
  for (const branch of ['prod/S002', 'prod/s001', 'feature']) {
    const input = fixture(branch)
    const api = apiFixture(input)
    await assert.rejects(
      verifyReleaseFromGitHub(input.event, 'fixture', api),
      /Untrusted source branch/,
    )
    assert.equal(api.calls.length, 0)
  }
})
