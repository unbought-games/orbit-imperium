import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = 'unbought-games/orbit-imperium'
const repositoryId = 1427640162
const shaPattern = /^[a-f0-9]{40}$/

export function verifyRelease({
  event,
  run,
  workflow,
  jobs,
  mainSha,
  comparison,
  expectedAttempt,
}) {
  assert.equal(event.repository.id, repositoryId, 'Unexpected event repository')
  assert.equal(event.repository.full_name, repository)
  const trigger = event.workflow_run
  const sha = trigger?.head_sha ?? event.inputs?.commit
  assert.match(sha ?? '', shaPattern, 'Select a full commit SHA')
  assert.match(mainSha, shaPattern)
  for (const candidate of trigger ? [trigger, run] : [run]) {
    assert.equal(
      candidate.repository.id,
      repositoryId,
      'Unexpected CI repository',
    )
    assert.equal(
      candidate.head_repository.id,
      repositoryId,
      'Fork CI is not trusted',
    )
    assert.equal(candidate.event, 'push', 'Only main push CI can release')
    assert.equal(candidate.head_branch, 'main')
    assert.equal(candidate.status, 'completed')
    assert.equal(candidate.conclusion, 'success')
    assert.equal(candidate.head_sha, sha, 'CI must test the selected revision')
    assert.equal(candidate.workflow_id, workflow.id)
  }
  if (trigger) {
    assert.equal(trigger.id, run.id)
    assert.equal(trigger.run_attempt, run.run_attempt, 'CI attempt changed')
  }
  if (expectedAttempt !== undefined)
    assert.equal(
      run.run_attempt,
      expectedAttempt,
      'CI attempt changed during publication',
    )
  assert.equal(workflow.path, '.github/workflows/ci.yml')
  assert.equal(workflow.state, 'active')
  // Compare the selected commit to a snapshot of main. Newer merges are allowed;
  // unmerged branches, detached PR commits and force-pushed-away history are not.
  assert.equal(comparison.base_commit.sha, sha)
  assert.equal(
    comparison.merge_base_commit.sha,
    sha,
    'Commit is not in main history',
  )
  assert.equal(
    comparison.status,
    mainSha === sha ? 'identical' : 'ahead',
    'Commit is not in main history',
  )
  const checks = jobs.filter((job) => job.name === 'Build, lint and unit tests')
  assert.equal(checks.length, 1, 'Expected exactly one aggregate CI check')
  assert.equal(checks[0].head_sha, sha)
  assert.equal(checks[0].status, 'completed')
  assert.equal(checks[0].conclusion, 'success', 'Aggregate CI check must pass')
  return sha
}

export async function verifyReleaseFromGitHub(event, token, options = {}) {
  const get = async (path) => {
    const response = await (options.fetch ?? fetch)(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
    if (!response.ok) throw new Error(`GitHub ${path}: ${response.status}`)
    return response.json()
  }
  assert.equal(event.repository.id, repositoryId)
  assert.equal(event.repository.full_name, repository)
  const sha = event.workflow_run?.head_sha ?? event.inputs?.commit
  assert.match(sha ?? '', shaPattern, 'Select a full commit SHA')
  let selected = event.workflow_run
  if (!selected && !options.ciRun) {
    const result = await get(
      `actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sha}&status=success&per_page=100`,
    )
    selected = result.workflow_runs.find(
      (run) =>
        run.head_sha === sha &&
        run.event === 'push' &&
        run.head_branch === 'main' &&
        run.conclusion === 'success',
    )
    assert.ok(
      selected,
      'Selected commit needs successful main push CI; rerun its CI run before publishing',
    )
  }
  const id = options.ciRun ?? selected.id
  assert.ok(Number.isSafeInteger(id) && id > 0, 'Invalid CI run ID')
  if (event.workflow_run) assert.equal(id, event.workflow_run.id)
  const expectedAttempt = options.ciAttempt ?? selected?.run_attempt
  assert.ok(
    Number.isSafeInteger(expectedAttempt) && expectedAttempt > 0,
    'Invalid CI attempt',
  )
  const [run, workflow, main, result] = await Promise.all([
    get(`actions/runs/${id}`),
    get('actions/workflows/ci.yml'),
    get('git/ref/heads/main'),
    get(`actions/runs/${id}/attempts/${expectedAttempt}/jobs?per_page=100`),
  ])
  assert.equal(run.id, id)
  assert.equal(result.total_count, result.jobs.length, 'Incomplete CI job list')
  const comparison = await get(`compare/${sha}...${main.object.sha}`)
  verifyRelease({
    event,
    run,
    workflow,
    jobs: result.jobs,
    mainSha: main.object.sha,
    comparison,
    expectedAttempt,
  })
  return { sha, ciRun: id, ciAttempt: expectedAttempt }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(
    process.env.GITHUB_REF,
    'refs/heads/main',
    'Publisher must run from main',
  )
  assert.ok(
    ['workflow_run', 'workflow_dispatch'].includes(
      process.env.GITHUB_EVENT_NAME,
    ),
  )
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const release = await verifyReleaseFromGitHub(event, process.env.GH_TOKEN, {
    ciRun: process.env.ORBIT_CI_RUN_ID
      ? Number(process.env.ORBIT_CI_RUN_ID)
      : undefined,
    ciAttempt: process.env.ORBIT_CI_RUN_ATTEMPT
      ? Number(process.env.ORBIT_CI_RUN_ATTEMPT)
      : undefined,
  })
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `sha=${release.sha}\nci_run=${release.ciRun}\nci_attempt=${release.ciAttempt}\n`,
  )
  console.log(
    `Trusted main-history revision: ${release.sha}; CI run ${release.ciRun} attempt ${release.ciAttempt}`,
  )
}
