// Read a private JSONL export including lookahead. Emit only aggregate values.
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

function distribution(times) {
  const sorted = times.toSorted((a, b) => a - b)
  const percentile = (p) => sorted[Math.ceil(p * sorted.length) - 1] ?? null
  return {
    observed: times.length,
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    p99_ms: percentile(0.99),
    max_ms: sorted.at(-1) ?? null,
  }
}

function boundary(eligible, times, limit) {
  const within = times.filter((value) => value <= limit).length
  return {
    eligible,
    within,
    percent: eligible ? (100 * within) / eligible : null,
    ...distribution(times),
  }
}

export async function dispatchPerformance(records, start, end) {
  if (!(Number.isFinite(start) && Number.isFinite(end) && start < end))
    throw Error('Expected a nonempty UTC observation window')
  const inWindow = (t) => t >= start && t < end
  const orders = new Map(),
    reviews = new Map(),
    responses = new Map(),
    background = new Set()
  function order(key) {
    if (!orders.has(key)) orders.set(key, { client: new Map(), http: [] })
    return orders.get(key)
  }
  function remember(map, event) {
    if (!map.has(event.phase)) map.set(event.phase, event)
  }
  for await (const event of records) {
    const time = Date.parse(event.timestamp)
    if (!Number.isFinite(time)) throw Error('Missing application timestamp')
    const id = event.command_id ?? event.observation_id
    const key = JSON.stringify([event.universe, id])
    if (event.event === 'dispatch_api_response') {
      if (
        !event.request_id ||
        !Number.isSafeInteger(event.elapsed_us) ||
        event.elapsed_us < 0
      )
        throw Error('Incomplete API measurement')
      if (!responses.has(event.request_id)) {
        const response = { ...event, time }
        responses.set(event.request_id, response)
        order(key).http.push(response)
      }
    } else if (
      event.event === 'command_admitted' &&
      event.action === 'fleet_dispatch' &&
      event.source === 'foreground'
    ) {
      order(key).admitted = event.admission_ack_us / 1000
    } else if (event.event === 'game_transition_committed') {
      if (event.action === 'fleet_dispatch') order(key).terminal = event.outcome
      else if (
        inWindow(time) &&
        [
          'FleetLegDue',
          'ManufacturingDue',
          'TransportArrived',
          'FleetReturned',
        ].includes(event.action)
      )
        background.add(
          JSON.stringify([event.action, event.universe, event.input_id]),
        )
    } else if (event.event === 'dispatch_client_observation') {
      if (!Number.isInteger(event.elapsed_ms) || event.elapsed_ms < 0)
        throw Error('Incomplete client measurement')
      if (event.phase.startsWith('review_')) {
        if (!reviews.has(key)) reviews.set(key, new Map())
        remember(reviews.get(key), { ...event, time })
      } else {
        remember(order(key).client, { ...event, time })
      }
    }
  }
  let warm = 0,
    cold = 0,
    repeated = 0,
    missingReview = 0
  const readyTimes = [],
    coldTimes = []
  for (const phases of reviews.values()) {
    const click =
      phases.get('review_started_warm') ?? phases.get('review_started_cold')
    if (!click?.foreground || !inWindow(click.time)) continue
    const reused = phases.get('review_ready_reused'),
      fetched = phases.get('review_ready_fetched')
    if (click.phase === 'review_started_cold') {
      cold++
      if (fetched?.foreground) coldTimes.push(fetched.elapsed_ms)
      continue
    }
    warm++
    if (fetched) repeated++
    else if (reused?.foreground) readyTimes.push(reused.elapsed_ms)
    else missingReview++
  }
  const apiTimes = [],
    clientAcceptance = [],
    visibleTimes = []
  let eligibleApi = 0,
    deniedApi = 0,
    uncertainApi = 0,
    limitedApi = 0,
    replayApi = 0
  for (const response of responses.values()) {
    if (!inWindow(response.time - response.elapsed_us / 1000)) continue
    // Classifiable client denials are separate. Capacity failures and ambiguous
    // calls receive no success credit. Each HTTP retry is a distinct request.
    if (
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 429].includes(response.status)
    ) {
      deniedApi++
      continue
    }
    eligibleApi++
    if (
      response.status === 202 &&
      ['committed', 'replay'].includes(response.admission)
    ) {
      apiTimes.push(response.elapsed_us / 1000)
      if (response.admission === 'replay') replayApi++
    } else if (response.status === 429) limitedApi++
    else uncertainApi++
  }
  let eligibleSend = 0,
    rejected = 0,
    notAdmitted = 0,
    uncertain = 0,
    missingStart = 0,
    missingVisible = 0,
    uncertainObserved = 0,
    missingApi = 0,
    capacityRefused = 0
  for (const o of orders.values()) {
    const click = o.client.get('send_started')
    // A durable foreground admission covers a lost client start. Count it as a
    // missing sample. A terminal alone may instead belong to a machine.
    const anchor =
      o.admitted ??
      click?.time ??
      (o.http.length
        ? Math.min(...o.http.map((r) => r.time - r.elapsed_us / 1000))
        : undefined)
    if (!inWindow(anchor) || click?.foreground === false) continue
    if (o.client.has('uncertain')) uncertainObserved++
    if (o.terminal === 'rejected') {
      rejected++
      continue
    }
    const denied =
      o.http.length &&
      o.http.every(
        (r) =>
          r.status >= 400 && r.status < 500 && ![408, 429].includes(r.status),
      )
    if (denied && o.admitted === undefined && !o.terminal) {
      notAdmitted++
      continue
    }
    eligibleSend++
    if (!o.http.length) missingApi++
    if (!click) missingStart++
    if (
      !o.terminal &&
      o.admitted === undefined &&
      o.http.length &&
      o.http.every((r) => r.status === 429)
    )
      capacityRefused++
    else if (o.terminal !== 'applied') uncertain++
    const accepted = o.client.get('accepted'),
      visible = o.client.get('confirmed_visible')
    if (click && accepted?.foreground)
      clientAcceptance.push(accepted.elapsed_ms)
    if (click && visible?.foreground && o.terminal === 'applied')
      visibleTimes.push(visible.elapsed_ms)
    else missingVisible++
  }
  const workload = {}
  for (const item of background) {
    const [action] = JSON.parse(item)
    workload[action] = (workload[action] ?? 0) + 1
  }
  return {
    start_utc: new Date(start).toISOString(),
    end_utc: new Date(end).toISOString(),
    review: {
      ...boundary(warm, readyTimes, 100),
      warm_repeat_requests: repeated,
      missing_ready: missingReview,
      cold_started: cold,
      cold_ready: distribution(coldTimes),
    },
    api_acceptance: {
      ...boundary(eligibleApi, apiTimes, 250),
      refused_requests: deniedApi,
      uncertain_requests: uncertainApi,
      capacity_limited: limitedApi,
      replay_responses: replayApi,
    },
    visible_launch: {
      ...boundary(eligibleSend, visibleTimes, 1000),
      game_rejected: rejected,
      admission_refused: notAdmitted,
      capacity_refused: capacityRefused,
      uncertain_orders: uncertain,
      client_reported_uncertain: uncertainObserved,
      missing_start: missingStart,
      missing_api_record: missingApi,
      missing_visible_confirmation: missingVisible,
    },
    click_to_acceptance: boundary(eligibleSend, clientAcceptance, 250),
    concurrent_committed_events: workload,
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [from, to] = process.argv.slice(2)
  if (![from, to].every((s) => s?.endsWith('Z')))
    throw Error('Supply UTC start and end timestamps ending in Z')
  async function* records() {
    for await (const line of createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    }))
      if (line.trim()) yield JSON.parse(line)
  }
  console.log(
    JSON.stringify(
      await dispatchPerformance(records(), Date.parse(from), Date.parse(to)),
      null,
      2,
    ),
  )
}
