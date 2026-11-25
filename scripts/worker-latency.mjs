// Aggregate a private export of Orbit JSON log records. Only aggregate values
// leave this process. Select by acknowledged admission time, including terminals
// after the window. Logical input time and the log collector clock never enter it.
import process from 'node:process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const phases = [
  'fact_load_us',
  'cpu_queue_us',
  'cpu_execution_us',
  'commit_revalidation_us',
  'persistence_us',
  'scoped_fence_us',
  'alliance_wait_us',
  'alliance_hold_us',
  'commit_round_trip_us',
]
const admissionPhases = [
  'admission_alliance_wait_us',
  'admission_alliance_hold_us',
]
const terminal = (event) =>
  ['applied', 'rejected'].includes(event.outcome) &&
  Number.isSafeInteger(event.commit_ack_us)

function summarize(times) {
  if (!times.length) return { count: 0 }
  times.sort((a, b) => a - b)
  const percentile = (p) => times[Math.ceil(times.length * p) - 1] / 1000
  // Same finite boundaries as the request and worker phase histograms.
  let matched = 0
  const buckets = {}
  for (const ms of [
    5, 10, 25, 50, 100, 150, 250, 500, 1000, 2500, 5000, 10000, 30000,
  ]) {
    while (matched < times.length && times[matched] <= ms * 1000) matched++
    buckets[ms] = matched
  }
  buckets['+Inf'] = times.length
  return {
    count: times.length,
    cumulative_buckets_ms: buckets,
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    p99_ms: percentile(0.99),
    max_ms: times.at(-1) / 1000,
  }
}

export async function workerLatency(records, startUs, endUs, action) {
  const admissions = new Map()
  const knownAdmissions = new Set()
  const attempts = new Map()
  let unsupported = 0
  for await (const event of records) {
    if (event.action !== action) continue
    const key = JSON.stringify([event.universe, event.input_id])
    if (event.event === 'command_admitted') {
      knownAdmissions.add(key)
      if (!Number.isSafeInteger(event.admission_ack_us) || !event.source) {
        unsupported++
      } else if (
        event.admission_ack_us >= startUs &&
        event.admission_ack_us < endUs
      ) {
        admissions.set(key, event)
      }
    } else if (
      ['worker_input_claimed', 'worker_input_attempt'].includes(event.event)
    ) {
      const observed = attempts.get(key) ?? { mode: event.mode }
      if (
        Number.isSafeInteger(event.claim_ack_us) &&
        (observed.first === undefined || event.claim_ack_us < observed.first)
      ) {
        observed.first = event.claim_ack_us
        observed.mode = event.mode
      }
      if (terminal(event)) observed.completed = event
      attempts.set(key, observed)
    }
  }
  const groups = new Map()
  for (const [key, admission] of admissions) {
    const observed = attempts.get(key)
    const completed = observed?.completed
    const mode = completed?.mode ?? observed?.mode ?? 'unknown'
    const groupKey = JSON.stringify([admission.source, mode])
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        source: admission.source,
        mode,
        admitted: 0,
        applied: 0,
        rejected: 0,
        missing_terminal: 0,
        missing_claim: 0,
        claim_before_admission_ack: 0,
        invalid_terminal_clock: 0,
        within_1s: 0,
        durations: Object.fromEntries(
          [
            'admission_to_first_observed_claim_us',
            'admission_to_terminal_us',
            ...admissionPhases,
            ...phases,
          ].map((k) => [k, []]),
        ),
      })
    }
    const group = groups.get(groupKey)
    group.admitted++
    for (const phase of admissionPhases) {
      if (Number.isSafeInteger(admission[phase]))
        group.durations[phase].push(admission[phase])
    }
    const first = observed?.first
    const start = admission.admission_ack_us
    if (first === undefined) group.missing_claim++
    else if (first < start) group.claim_before_admission_ack++
    else
      group.durations.admission_to_first_observed_claim_us.push(first - start)
    if (!completed) {
      group.missing_terminal++
      continue
    }
    group[completed.outcome]++
    for (const phase of phases) {
      if (Number.isSafeInteger(completed[phase]))
        group.durations[phase].push(completed[phase])
    }
    if (
      completed.commit_ack_us < start ||
      (Number.isSafeInteger(completed.claim_ack_us) &&
        completed.commit_ack_us < completed.claim_ack_us)
    ) {
      group.invalid_terminal_clock++
      continue
    }
    const delay = completed.commit_ack_us - start
    group.durations.admission_to_terminal_us.push(delay)
    if (delay <= 1_000_000) group.within_1s++
  }
  return {
    action,
    terminals_in_window_without_admission_in_export: [...attempts].filter(
      ([key, { completed }]) =>
        !knownAdmissions.has(key) &&
        completed?.commit_ack_us >= startUs &&
        completed.commit_ack_us < endUs,
    ).length,
    start_us: startUs,
    end_us: endUs,
    admissions_without_wall_time_or_source_in_export: unsupported,
    groups: [...groups.values()].map(({ durations, ...group }) => ({
      ...group,
      distributions: Object.fromEntries(
        Object.entries(durations).map(([k, times]) => [
          k.slice(0, -3),
          summarize(times),
        ]),
      ),
    })),
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [start, end, action = 'fleet_dispatch'] = process.argv.slice(2)
  const startUs = Date.parse(start) * 1000
  const endUs = Date.parse(end) * 1000
  if (!(start?.endsWith('Z') && end?.endsWith('Z') && startUs < endUs)) {
    throw new Error(
      'Provide UTC start and end timestamps ending in Z, followed by an optional action.',
    )
  }
  async function* records() {
    for await (const line of createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    })) {
      if (line.trim()) yield JSON.parse(line)
    }
  }
  const report = await workerLatency(records(), startUs, endUs, action)
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
