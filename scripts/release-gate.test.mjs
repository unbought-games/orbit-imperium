import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import yaml from 'js-yaml'
import { verifyRelease } from './release-gate.mjs'

function fixture() {
  const sha = 'a'.repeat(40)
  const run = {
    id: 123,
    run_attempt: 1,
    workflow_id: 456,
    repository: { id: 1427640162 },
    head_repository: { id: 1427640162 },
    event: 'push',
    head_branch: 'main',
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
    mainSha: sha,
  }
}

test('releases only the exact current main revision with its successful aggregate check', () => {
  const input = fixture()
  assert.equal(verifyRelease(input), input.mainSha)
})

test('rejects forks, other branches/events/workflows, stale revisions, reruns and incomplete CI', () => {
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
      x.run.head_branch = 'feature'
    },
    (x) => {
      x.run.conclusion = 'failure'
    },
    (x) => {
      x.run.status = 'in_progress'
    },
    (x) => {
      x.mainSha = 'b'.repeat(40)
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
  assert.deepEqual(Object.keys(release.on), ['workflow_run'])
  assert.deepEqual(release.on.workflow_run, {
    workflows: ['CI'],
    types: ['completed'],
    branches: ['main'],
  })
  assert.equal(release.concurrency['cancel-in-progress'], false)
  assert.deepEqual(release.permissions, { contents: 'read' })
  assert.equal(release.jobs.trusted.permissions['id-token'], undefined)
  assert.equal(release.jobs.publish.needs, 'trusted')
  const steps = release.jobs.publish.steps
  assert.equal(steps[0].with.ref, '${{ needs.trusted.outputs.sha }}')
  const inspect = steps.findIndex(
    (step) => step.run === 'make inspect-release-image',
  )
  const auth = steps.findIndex((step) => step.uses?.startsWith('aws-actions/'))
  assert.ok(inspect > 0 && auth > inspect)
  assert.equal(steps[auth - 1].run, 'node scripts/release-gate.mjs')
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
  assert.deepEqual(ci.permissions, { contents: 'read' })
  for (const job of Object.values(ci.jobs))
    assert.equal(job.permissions?.['id-token'], undefined)
})
