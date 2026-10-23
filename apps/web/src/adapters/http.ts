import { resetAnalytics } from './optional-services'
import type { Bootstrap } from '../client-model/bootstrap'
import { validate } from '../client-model/schema'
import type {
  GamePort,
  BoundQuote,
  BoundReceipt,
  BoundView,
  BoundSettings,
  BindingCandidate,
} from '../client-model/commands'
import type { components } from '../contracts'
export type Session = components['schemas']['Session']
export type View = components['schemas']['GameView']
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterMs = 0,
  ) {
    super(code)
  }
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  csrf?: string,
  timeoutMs = 10000,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const res = await fetch(path, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const problem: unknown = await res.json().catch(() => null)
    const error = new HttpError(
      res.status,
      typeof problem === 'object' && problem && 'code' in problem
        ? String(problem.code)
        : 'Request failed',
      Math.max(0, Number(res.headers.get('Retry-After') ?? 0) * 1000),
    )
    if (problem && typeof problem === 'object' && 'game_code' in problem)
      error.message = String(problem.game_code)
    throw error
  }
  if (res.status === 204) return null
  return res.json()
}
export const http = {
  async bootstrap() {
    return validate<Bootstrap>(
      'Bootstrap',
      await request('/api/v1/bootstrap', 'GET', undefined, undefined, 10000, {
        'X-Orbit-View-Metadata': '1',
      }),
    )
  },
  // Allow the existing credential budget plus server game preparation and transit.
  async loginBootstrap(name: string, password: string) {
    return validate<Bootstrap>(
      'Bootstrap',
      await request(
        '/api/v1/session?bootstrap=true',
        'POST',
        { name, password },
        undefined,
        20000,
        { 'X-Orbit-View-Metadata': '1' },
      ),
    )
  },
  async signupBootstrap(name: string, password: string) {
    return validate<Bootstrap>(
      'Bootstrap',
      await request(
        '/api/v1/registration?bootstrap=true',
        'POST',
        { name, password },
        undefined,
        20000,
        { 'X-Orbit-View-Metadata': '1' },
      ),
    )
  },
  async registration() {
    return validate<{ enabled: boolean }>(
      'RegistrationStatus',
      await request('/api/v1/registration'),
    )
  },
  async signup(name: string, password: string) {
    return validate<Session>(
      'Session',
      await request('/api/v1/registration', 'POST', { name, password }),
    )
  },
  async session() {
    return validate<Session>('Session', await request('/api/v1/session'))
  },
  async login(name: string, password: string) {
    return validate<Session>(
      'Session',
      await request('/api/v1/session', 'POST', { name, password }),
    )
  },
  async renewSession(csrf: string) {
    await request('/api/v1/session/renew', 'POST', undefined, csrf, 30000)
  },
  async logout(csrf: string) {
    resetAnalytics()
    await request('/api/v1/session', 'DELETE', undefined, csrf)
  },
}

export function gamePort(
  csrf: string,
  initial?: Pick<BindingCandidate, 'binding' | 'protocol'>,
): GamePort {
  const protocols = new Map<string, 2 | 3 | 4>()
  if (initial) protocols.set(initial.binding.universe, initial.protocol)
  const base = (u: string, protocol = protocols.get(u) ?? 2) =>
    `/api/v${protocol}/universes/${u}`
  return {
    async world(context, query) {
      return validate(
        'BoundWorld4',
        await request(
          `${base(context.binding.universe)}/world`,
          'POST',
          { context, ...query },
          csrf,
        ),
      )
    },
    async reports(context, cursor, includeHidden = false) {
      return validate(
        'BoundReports4',
        await request(
          `${base(context.binding.universe)}/reports`,
          'POST',
          {
            context,
            cursor,
            kind: null,
            limit: 50,
            include_hidden: includeHidden,
          },
          csrf,
        ),
      )
    },
    async report(context, id) {
      return validate(
        'BoundReport4',
        await request(
          `${base(context.binding.universe)}/reports/${id}`,
          'POST',
          context,
          csrf,
        ),
      )
    },
    async currentBinding(u, id) {
      let raw: unknown
      try {
        raw = await request(`${base(u, 2)}/binding?request_id=${id}`)
      } catch (e) {
        if (!(e instanceof HttpError) || e.status !== 426) throw e
        try {
          raw = await request(`${base(u, 3)}/binding?request_id=${id}`)
        } catch (e) {
          if (!(e instanceof HttpError) || e.status !== 426) throw e
          raw = await request(`${base(u, 4)}/binding?request_id=${id}`)
        }
      }
      const candidate = validate<BindingCandidate>('GameBindingCandidate', raw)
      protocols.set(u, candidate.protocol)
      return candidate
    },
    async progressionOptions(context, requestBody) {
      return validate<
        import('../client-model/commands').BoundProgressionOptions
      >(
        'GameProgressionOptions',
        await request(
          `${base(context.binding.universe)}/progression-options`,
          'POST',
          { context, request: requestBody },
          csrf,
        ),
      )
    },
    async view(context, minimumViewerRevision) {
      return validate<BoundView>(
        'GameView',
        await request(
          `${base(context.binding.universe)}/overview`,
          'POST',
          context,
          csrf,
          10000,
          {
            'X-Orbit-View-Metadata': '1',
            ...(minimumViewerRevision
              ? { 'X-Orbit-Minimum-Revision': minimumViewerRevision }
              : {}),
          },
        ),
      )
    },
    async settings(context) {
      return validate<BoundSettings>(
        'GameSettings',
        await request(
          `${base(context.binding.universe)}/settings`,
          'POST',
          context,
          csrf,
        ),
      )
    },
    async quote(context, requestBody) {
      return validate<BoundQuote>(
        'GameQuote',
        await request(
          `${base(context.binding.universe)}/quotes`,
          'POST',
          { context, request: requestBody },
          csrf,
        ),
      )
    },
    async submit(envelope) {
      return validate<BoundReceipt>(
        'GameReceipt',
        await request(
          `${base(envelope.binding.universe, envelope.protocol)}/${envelope.protocol === 4 && !envelope.presence ? 'presence' : 'commands'}`,
          'POST',
          envelope.protocol === 4
            ? envelope.presence
              ? {
                  presence: envelope.presence,
                  gameplay: {
                    protocol: 4,
                    binding: envelope.binding,
                    command_id: envelope.command_id,
                    command: envelope.command,
                  },
                }
              : {
                  protocol: 4,
                  binding: envelope.binding,
                  command_id: envelope.command_id,
                  command: envelope.command,
                }
            : envelope,
          csrf,
        ),
      )
    },
    async receipt(b, id) {
      return validate<BoundReceipt>(
        'GameReceipt',
        await request(`${base(b.universe)}/commands/${id}?epoch=${b.epoch}`),
      )
    },
  }
}
