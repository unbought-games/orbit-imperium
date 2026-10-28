export type EventKind =
  | 'spy'
  | 'fleet'
  | 'building'
  | 'research'
  | 'shipyard'
  | 'defense'
  | 'report'
  | 'message'
  | 'attack'
  | 'scan'
export type Tone = 'ice' | 'champagne' | 'green' | 'red'
export type HudEvent = { id: number; kind: EventKind; at: number }
export type HudState = {
  events: HudEvent[]
  readIds: number[]
  dismissedToastIds: number[]
  acknowledgedIds: number[]
  selectedId: number | 'inbox' | null
}
export const fleetCapacity = 8
export const eventCopy: Record<
  EventKind,
  { title: string; detail: string; tone: Tone; label: string }
> = {
  spy: {
    title: 'Probe away',
    detail: 'Espionage · [1:42:9]',
    tone: 'ice',
    label: 'Send probe',
  },
  fleet: {
    title: 'Fleet dispatched',
    detail: '12 cruisers · Attack mission',
    tone: 'ice',
    label: 'Dispatch fleet',
  },
  building: {
    title: 'Construction started',
    detail: 'Metal Mine → level 18 · 12m 40s',
    tone: 'green',
    label: 'Build mine',
  },
  research: {
    title: 'Research started',
    detail: 'Astrophysics → level 5 · 28m 10s',
    tone: 'green',
    label: 'Start research',
  },
  shipyard: {
    title: 'Shipyard order accepted',
    detail: '10 light fighters · Queue 08m 20s',
    tone: 'green',
    label: 'Queue ships',
  },
  defense: {
    title: 'Defense order accepted',
    detail: '20 rocket launchers · Queue 04m 00s',
    tone: 'green',
    label: 'Queue defense',
  },
  report: {
    title: 'Espionage report',
    detail: 'Nereid · [1:42:9] · Tap to decrypt',
    tone: 'champagne',
    label: 'Receive report',
  },
  message: {
    title: 'Alliance transmission',
    detail: 'Commander Lyra · Tap to read',
    tone: 'champagne',
    label: 'Receive message',
  },
  attack: {
    title: 'Hostile fleet inbound',
    detail: '18 ships → Aster · [1:42:8]',
    tone: 'red',
    label: 'Incoming attack',
  },
  scan: {
    title: 'Enemy probes detected',
    detail: '3 probes → Aster · [1:42:8]',
    tone: 'red',
    label: 'Incoming spy',
  },
}
export const isMessage = (event: HudEvent) =>
  event.kind === 'message' || event.kind === 'report'
export const isThreat = (event: HudEvent) =>
  event.kind === 'attack' || event.kind === 'scan'
export function initialHud(now: number, unread = true): HudState {
  return {
    events: unread
      ? [
          { id: 1, kind: 'report', at: now - 20000 },
          { id: 2, kind: 'message', at: now - 19000 },
          { id: 3, kind: 'report', at: now - 18000 },
        ]
      : [],
    readIds: [],
    dismissedToastIds: [],
    acknowledgedIds: [],
    selectedId: null,
  }
}
export function flightArrival(event: HudEvent) {
  return (
    event.at +
    (event.kind === 'spy' ? 42000 : event.kind === 'scan' ? 75000 : 164000)
  )
}
export function fleetUsed(state: HudState, now: number) {
  return (
    2 +
    state.events.filter(
      (event) =>
        (event.kind === 'spy' || event.kind === 'fleet') &&
        flightArrival(event) + 42000 > now,
    ).length
  )
}
export function hudView(state: HudState, now: number) {
  const unread = state.events.filter(
    (event) => isMessage(event) && !state.readIds.includes(event.id),
  )
  const threats = state.events.filter(
    (event) => isThreat(event) && !state.acknowledgedIds.includes(event.id),
  )
  const recent = state.events.filter((event) => now - event.at < 7000)
  const feedback = recent
    .filter((event) => eventCopy[event.kind].tone === 'green')
    .at(-1)
  const tone: Tone = threats.length
    ? 'red'
    : feedback
      ? 'green'
      : unread.length
        ? 'champagne'
        : 'ice'
  return {
    unread,
    threats,
    tone,
    feedback,
    toasts: recent
      .slice(-3)
      .filter((event) => !state.dismissedToastIds.includes(event.id))
      .reverse(),
    used: fleetUsed(state, now),
  }
}
export type HudAction =
  | { type: 'trigger'; kind: EventKind; now: number }
  | { type: 'open'; id: number | 'inbox' }
  | { type: 'dismiss-toast'; id: number }
  | { type: 'close' }
  | { type: 'acknowledge' }
  | { type: 'reset'; now: number; unread?: boolean }
export function hudReducer(state: HudState, action: HudAction): HudState {
  switch (action.type) {
    case 'trigger':
      if (
        (action.kind === 'spy' || action.kind === 'fleet') &&
        fleetUsed(state, action.now) >= fleetCapacity
      )
        return state
      return {
        ...state,
        events: [
          ...state.events,
          {
            id: (state.events.at(-1)?.id ?? 0) + 1,
            kind: action.kind,
            at: action.now,
          },
        ],
      }
    case 'open': {
      const ids =
        action.id === 'inbox'
          ? state.events.filter(isMessage).map((event) => event.id)
          : state.events
              .filter((event) => event.id === action.id && isMessage(event))
              .map((event) => event.id)
      return {
        ...state,
        selectedId: action.id,
        readIds: [...new Set([...state.readIds, ...ids])],
      }
    }
    case 'dismiss-toast':
      return {
        ...state,
        dismissedToastIds: [
          ...new Set([...state.dismissedToastIds, action.id]),
        ],
      }
    case 'close':
      return { ...state, selectedId: null }
    case 'acknowledge':
      return {
        ...state,
        acknowledgedIds: state.events.filter(isThreat).map((event) => event.id),
        selectedId: null,
      }
    case 'reset':
      return initialHud(action.now, action.unread ?? false)
  }
}
export function countdown(at: number, now: number) {
  const seconds = Math.max(0, Math.ceil((at - now) / 1000))
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
