import { useEffect, useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { Coordinator } from '../../src/client-model/coordinator'
import type { GamePort, QueryContext } from '../../src/client-model/commands'
import { emptySocialView } from '../../src/client-model/social'
import { useCommands } from '../../src/client-model/use-commands'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { SessionContext } from '../../src/shell/session-context'
import { BriefingLink } from '../../src/features/tutorial/briefing-link'
import { CommandOrb } from '../../src/features/command-hud/hud-controls'
import { HudPanel } from '../../src/features/command-hud/hud-panel'
import { HudToasts } from '../../src/features/command-hud/hud-toasts'
import { hudToastViews } from '../../src/features/command-hud/notification-history'
import { useCommandHud } from '../../src/features/command-hud/use-command-hud'
import styles from '../../src/features/command-hud/hud.module.css'
import { id, readyFixture } from '../../src/test-support/bootstrap'
import { body } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'
import type { components } from '../../src/contracts'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'

type S = components['schemas']
export type HudInput = {
  headers?: S['ReportHeader4'][]
  reports?: number
  invalidCursor?: boolean
  missions?: S['MissionView4']
  playerNames?: S['PublicPlayerNames4']
  homeName?: string
  canAttack?: boolean
  destinations?: S['Destination'][]
  kind?: 'Espionage' | 'SpyContact'
}
declare global {
  interface Window {
    hudInput?: HudInput
    hudScene: Awaited<ReturnType<typeof prepareHud>>
  }
}

async function prepareHud(input: HudInput = {}) {
  const time = 1793120000000
  const { session, snapshot } = readyFixture(4)
  const view = snapshot.view
  if (view.protocol !== 4) throw Error('Expected protocol 4')
  const headers: S['ReportHeader4'][] =
    input.headers ??
    Array.from({ length: input.reports ?? 0 }, (_, index) => ({
      id: id(4000 + index),
      kind: input.kind ?? 'Espionage',
      read: false,
      hidden: false,
      observed_at: time - index,
    }))
  view.bodies = [{ ...body, name: input.homeName }]
  if (input.missions) view.missions = input.missions
  if (input.playerNames) view.player_names = input.playerNames
  view.progression.production = [productionFixture(body)]
  view.destinations = input.destinations ?? []
  view.has_unread_reports = headers.length > 0
  view.capabilities = [
    input.canAttack === false
      ? { capability: 'Attack', enabled: false, reason: 'UnavailableContent' }
      : { capability: 'Attack', enabled: true, reason: 'Available' },
  ]
  view.as_of_ms = view.sampled_at = snapshot.candidate.sampled_at = time
  view.viewer_revision = '1'
  const calls: Array<string | null> = []
  let held:
    | { cursor: string | null; wait: Promise<void>; release: () => void }
    | undefined
  let failure: string | undefined
  let mailboxUnavailable = false
  const metadata = (context: QueryContext) => ({
    ...context,
    protocol: 4 as const,
    viewer_revision: view.viewer_revision,
    sampled_at: time,
    as_of_ms: time,
  })
  const unexpected = async (): Promise<never> => {
    throw Error('Unexpected HUD port call')
  }
  const port: GamePort = {
    currentBinding: async (_, request_id) => ({
      ...snapshot.candidate,
      request_id,
    }),
    settings: async (context) => ({ ...snapshot.settings, ...context }),
    view: async (context) => structuredClone({ ...view, ...context }),
    quote: unexpected,
    receipt: unexpected,
    socialQuery: async (context) => {
      if (mailboxUnavailable) throw Error('Unavailable')
      return { ...context, ...emptySocialView() }
    },
    reports: async (context, cursor, _hidden, query) => {
      calls.push(cursor)
      if (cursor === failure) throw Error('Unavailable')
      if (held?.cursor === cursor) await held.wait
      const rows = headers.filter(
        (header) => !query?.filter.unread_only || !header.read,
      )
      const start = cursor
        ? rows.findIndex((header) => header.id === cursor) + 1
        : 0
      const items = rows.slice(start, start + 50)
      const hasMore = input.invalidCursor || start + items.length < rows.length
      return structuredClone({
        ...metadata(context),
        data: {
          items,
          has_more: !!hasMore,
          next_cursor:
            hasMore && !input.invalidCursor ? items.at(-1)!.id : null,
          unread_count: Math.min(
            99,
            headers.filter((header) => !header.read).length,
          ),
          as_of_ms: time,
        },
      })
    },
    report: async (context, item) =>
      structuredClone({
        ...metadata(context),
        data: {
          header: headers.find((header) => header.id === item)!,
          payload: observation as S['EspionagePayload4'],
        },
      }),
    submit: async (envelope) => {
      const command = envelope.command
      if (command.type !== 'World' || command.action.type !== 'MarkReportRead')
        return unexpected()
      const report = command.action.report
      headers.find((header) => header.id === report)!.read = true
      view.viewer_revision = String(Number(view.viewer_revision) + 1)
      view.has_unread_reports = headers.some((header) => !header.read)
      return {
        protocol: 4,
        binding: view.binding,
        command_id: envelope.command_id,
        status: 'Committed',
        admitted_at: time,
        executed_at: time,
        result_ids: [],
        minimum_viewer_revision: view.viewer_revision,
      }
    },
  }
  let next = 100
  const model = new Coordinator(port, {
    newId: () => id(next++),
    monotonicNowMs: () => performance.now(),
    isOnline: () => true,
  })
  await model.initialize(session, structuredClone(snapshot))
  return {
    model,
    session,
    headers,
    calls,
    view,
    hold(cursor: string | null) {
      let release!: () => void
      const wait = new Promise<void>((resolve) => {
        release = resolve
      })
      held = { cursor, wait, release }
    },
    release() {
      held?.release()
      held = undefined
    },
    fail(cursor?: string) {
      failure = cursor
    },
    setMailboxFailure(value: boolean) {
      mailboxUnavailable = value
    },
    async refresh() {
      view.viewer_revision = String(Number(view.viewer_revision) + 1)
      await model.refresh()
    },
  }
}
const scene = await prepareHud(window.hudInput)
const profiles = new PlayerProfilesController(async () => ({
  binding: scene.view.binding,
  request_id: id(8),
  players: [],
}))

export function CommandHudScenario() {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute().addChildren([]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  const { model, session } = scene
  const commands = useCommands({
    status: 'authenticated',
    source: 'document',
    signupEnabled: true,
    session,
    game: { status: 'ready', model },
  })
  const hud = useCommandHud(model)
  useEffect(() => {
    window.hudScene = scene
    return () => {
      scene.release()
      Reflect.deleteProperty(window, 'hudScene')
    }
  }, [])
  return (
    <RouterContextProvider router={router}>
      <SessionContext.Provider
        value={{
          model,
          view: commands.view!,
          commands,
          universeName: 'Andromeda',
          logout: async () => {},
        }}
      >
        <PlayerProfilesContext.Provider value={profiles}>
          <main style={{ minHeight: '200vh' }} />
          <div className={styles.surface}>
            <div className={styles.hudLayer}>
              <HudToasts
                notices={hudToastViews(hud.state, hud.toasts)}
                onOpen={hud.select}
                onDismiss={hud.dismiss}
              />
              <CommandOrb hud={hud} />
            </div>
            <HudPanel
              hud={hud}
              model={model}
              universe="Andromeda"
              body={body.id}
              onDraft={() => {
                throw Error('Unexpected dispatch')
              }}
              headingAction={
                <BriefingLink
                  appearance="button"
                  onClick={() => hud.select(null)}
                />
              }
            />
          </div>
        </PlayerProfilesContext.Provider>
      </SessionContext.Provider>
    </RouterContextProvider>
  )
}
