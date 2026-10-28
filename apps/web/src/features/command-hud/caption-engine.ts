/** Copy and policy live together; absence of a caption rule means silence. */
export const captionRules = {
  ready: { explanation: 'Systems Online', once: true },
  unread: { explanation: 'Champagne means unread.', once: true },
  disconnected: { explanation: 'Connection lost.' },
  reconnected: { explanation: 'Connection restored.' },
  'probe.launched': {
    personality: [
      'Act natural.',
      'For research purposes.',
      'Just having a little look.',
    ],
  },
  'probe.destroyed': {
    personality: [
      'Whoops.',
      'Good thing we sent the bad one.',
      'It was defective anyways.',
    ],
  },
  'fleet.launched': {
    personality: [
      'Are we there yet?',
      'Seatbelts. Probably.',
      'Taking the scenic route.',
    ],
  },
  'building.started': {
    personality: [
      'Some assembly required.',
      'The hard hats are on.',
      'Another tasteful space shed.',
    ],
  },
  'research.started': {
    personality: [
      'Science noises intensify.',
      'Let them cook.',
      'Peer review can wait.',
    ],
  },
  'shipyard.queued': {
    personality: [
      'Batteries not included.',
      'Some assembly required.',
      'Fresh ships. New ship smell.',
    ],
  },
  'defense.queued': {
    personality: [
      'A very firm welcome mat.',
      'Get off my orbit.',
      'Home security, upgraded.',
    ],
  },
  'message.received': {
    personality: [
      'Space mail.',
      'You have space mail.',
      'The inbox has entered orbit.',
    ],
  },
  'report.received': {},
  'attack.incoming': {},
  'spy.incoming': {},
} satisfies Record<string, CaptionRule>

type CaptionRule = {
  explanation?: string
  once?: boolean
  personality?: readonly string[]
}
export type CaptionEventKind = keyof typeof captionRules
export type CaptionEvent = { id: string; kind: CaptionEventKind }
export type Caption = {
  id: number
  text: string
  category: 'explanation' | 'personality'
  typingMs: number
  lifetimeMs: number
}
export const captionPolicy = {
  humorCooldownMs: 90_000,
  humorChance: 0.25,
  quietDelayMs: 7500,
  holdMs: 3000,
  fadeMs: 400,
  typingDelayMs: 150,
}
export function captionTiming(text: string) {
  const typingMs = Math.max(500, Math.min(1200, text.length * 35))
  return {
    typingMs,
    lifetimeMs:
      captionPolicy.typingDelayMs +
      typingMs +
      captionPolicy.holdMs +
      captionPolicy.fadeMs,
  }
}
const priority = (kind: CaptionEventKind) =>
  kind === 'attack.incoming' || kind === 'disconnected'
    ? 100
    : kind === 'spy.incoming'
      ? 90
      : kind === 'probe.destroyed'
        ? 80
        : kind === 'unread' || kind === 'reconnected'
          ? 60
          : 10

/** Session-local presentation history. No game facts or persistent notification state. */
export function createCaptionEngine(
  options: { now?: () => number; random?: () => number } = {},
) {
  const now = options.now ?? (() => performance.now())
  const random = options.random ?? Math.random
  const listeners = new Set<() => void>()
  const seen = new Set<string>()
  const explained = new Set<CaptionEventKind>()
  const lastLine = new Map<CaptionEventKind, string>()
  let caption: Caption | null = null
  let serial = 0
  let lastHumor = -Infinity
  let pending: ReturnType<typeof setTimeout> | undefined
  let expiry: ReturnType<typeof setTimeout> | undefined
  const publish = (next: Caption | null) => {
    caption = next
    for (const listener of listeners) listener()
  }
  const cancelPending = () => {
    clearTimeout(pending)
    pending = undefined
  }
  const clear = () => {
    clearTimeout(expiry)
    publish(null)
  }
  const show = (text: string, category: Caption['category']) => {
    clearTimeout(expiry)
    publish({ id: ++serial, text, category, ...captionTiming(text) })
    expiry = setTimeout(clear, captionTiming(text).lifetimeMs)
  }
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => caption,
    handle(events: CaptionEvent[], allowHumor = true) {
      const fresh = events.filter((event) => !seen.has(event.id))
      if (!fresh.length) return
      for (const event of fresh) seen.add(event.id)
      while (seen.size > 512) seen.delete(seen.values().next().value!)
      cancelPending()
      if (caption?.category === 'personality') clear()
      const event = fresh.sort((a, b) => priority(b.kind) - priority(a.kind))[0]
      const rule: CaptionRule = captionRules[event.kind]
      if (rule.explanation && (!rule.once || !explained.has(event.kind))) {
        explained.add(event.kind)
        show(rule.explanation, 'explanation')
        return
      }
      // Urgent cards remain factual and clear any stale commentary.
      if (priority(event.kind) >= 90) {
        clear()
        return
      }
      const pool = rule.personality
      if (
        !allowHumor ||
        !pool?.length ||
        now() - lastHumor < captionPolicy.humorCooldownMs ||
        random() >= captionPolicy.humorChance
      )
        return
      // Never queue a punchline behind newer events or an explanatory caption.
      pending = setTimeout(() => {
        pending = undefined
        if (caption || now() - lastHumor < captionPolicy.humorCooldownMs) return
        const choices = pool.filter((line) => line !== lastLine.get(event.kind))
        const text =
          choices[
            Math.min(choices.length - 1, Math.floor(random() * choices.length))
          ] ?? pool[0]
        lastLine.set(event.kind, text)
        lastHumor = now()
        show(text, 'personality')
      }, captionPolicy.quietDelayMs)
    },
    suspend() {
      cancelPending()
      clear()
    },
  }
}
