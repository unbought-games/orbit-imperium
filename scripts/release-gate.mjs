import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = 'unbought-games/orbit-imperium'
const repositoryId = 1427640162

export function verifyRelease({ event, run, workflow, jobs, mainSha }) {
  const trigger = event.workflow_run
  assert.equal(event.repository.id, repositoryId, 'Unexpected event repository')
  assert.equal(event.repository.full_name, repository)
  for (const candidate of [trigger, run]) {
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
    assert.match(candidate.head_sha, /^[a-f0-9]{40}$/)
    assert.equal(candidate.head_sha, mainSha, 'CI revision is no longer main')
    assert.equal(candidate.workflow_id, workflow.id)
  }
  assert.equal(trigger.id, run.id)
  assert.equal(
    trigger.run_attempt,
    run.run_attempt,
    'CI attempt changed; use its completion event',
  )
  assert.equal(workflow.path, '.github/workflows/ci.yml')
  assert.equal(workflow.state, 'active')
  const checks = jobs.filter((job) => job.name === 'Build, lint and unit tests')
  assert.equal(checks.length, 1, 'Expected exactly one aggregate CI check')
  assert.equal(checks[0].head_sha, mainSha)
  assert.equal(checks[0].status, 'completed')
  assert.equal(checks[0].conclusion, 'success', 'Aggregate CI check must pass')
  return mainSha
}

export async function verifyReleaseFromGitHub(event, token) {
  const trigger = event.workflow_run
  assert.ok(Number.isSafeInteger(trigger.id) && trigger.id > 0)
  const get = async (path) => {
    const response = await fetch(
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
  const [run, workflow, main, result] = await Promise.all([
    get(`actions/runs/${trigger.id}`),
    get('actions/workflows/ci.yml'),
    get('git/ref/heads/main'),
    get(`actions/runs/${trigger.id}/jobs?filter=latest&per_page=100`),
  ])
  assert.equal(result.total_count, result.jobs.length, 'Incomplete CI job list')
  return verifyRelease({
    event,
    run,
    workflow,
    jobs: result.jobs,
    mainSha: main.object.sha,
  })
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const sha = await verifyReleaseFromGitHub(event, process.env.GH_TOKEN)
  appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\n`)
  console.log(`Trusted main revision: ${sha}; CI run ${event.workflow_run.id}`)
}
