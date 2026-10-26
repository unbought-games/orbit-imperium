import { commandId } from '../../adapters/command-id'
import {
  useProfilePlayers,
  useRefreshPlayerProfiles,
} from '../../shell/player-profiles-context'
import { AllianceDrafts, AllianceDraftContext } from './drafts'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { useSearch } from '@tanstack/react-router'
import { bindingKey } from '../../client-model/commands'
import { AlliancesController, can } from '../../client-model/alliances'
import type { Coordinator } from '../../client-model/coordinator'
import type { components } from '../../contracts'
import { useGameSession } from '../../shell/session-context'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import {
  ActionForm,
  ConfirmAction,
  Markdown,
  Summary,
  value,
  type Run,
} from './shared'
import { usePublicAlliance } from './public-page'
import { Board } from './board'
import { Roles } from './roles'
import { Roster, Applications, Settings, Audit } from './administration'
import styles from './alliances.module.css'
const identityActions = new Set([
  'Create',
  'Join',
  'Accept',
  'Leave',
  'Kick',
  'Disband',
  'Update',
  'Transfer',
])
export function AllianceScreen() {
  const { model, view } = useGameSession()
  const search = useSearch({ strict: false }) as { alliance?: string }
  return (
    <AllianceWorkspace
      key={bindingKey(view.binding)}
      model={model}
      universe={view.binding.universe}
      player={view.binding.player}
      initialAlliance={search.alliance}
    />
  )
}
function AllianceWorkspace({
  model,
  universe,
  player,
  initialAlliance,
}: {
  model: Coordinator
  universe: string
  player: string
  initialAlliance?: string
}) {
  const [drafts] = useState(() => new AllianceDrafts())
  const [controller] = useState(
    () =>
      new AlliancesController({
        read: (query) => model.allianceQuery(query),
        command: (request) => model.allianceCommand(request),
        newId: () => commandId(crypto),
        onAccessLost: drafts.clear,
      }),
  )
  const state = useStore(controller.store)
  const refreshProfiles = useRefreshPlayerProfiles()
  const [tab, setTab] = useState('Board')
  const [selected, setSelected] = useState<string | undefined>(initialAlliance)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [directory, setDirectory] = useState(false)
  useEffect(() => {
    void controller.refresh()
    return () => controller.clear()
  }, [controller])
  useEffect(() => {
    setSelected(initialAlliance)
  }, [initialAlliance])
  const detail = state.view?.alliance
  const publicAlliance = usePublicAlliance(
    universe,
    selected && selected !== detail?.summary.id ? selected : undefined,
  )
  const busy = state.busy || state.loading || !!state.pending
  const run: Run = async (action) => {
    const ok = await controller.run(action)
    if (ok) {
      if (identityActions.has(action.type)) refreshProfiles()
      setSelected(undefined)
      setDirectory(false)
    }
    return ok
  }
  const browse = (nextOffset = 0) => {
    setOffset(nextOffset)
    setDirectory(true)
    setSelected(undefined)
    void controller.refresh({ type: 'Directory', search, offset: nextOffset })
  }
  const own = () => {
    setSelected(undefined)
    setDirectory(false)
    setTab('Board')
    void controller.refresh({ type: 'Mine' })
  }
  const tabs = detail
    ? [
        'Board',
        ...(can(detail, 'ViewMembers') ? ['Members'] : []),
        ...(can(detail, 'ViewApplications') ? ['Applications'] : []),
        ...(detail.roles &&
        (can(detail, 'ManageRoles') || can(detail, 'AssignRoles'))
          ? ['Roles']
          : []),
        'Settings',
        ...(can(detail, 'ViewAudit') ? ['Audit'] : []),
      ]
    : []
  const active = tabs.includes(tab) ? tab : 'Board'
  const visiblePlayers =
    !detail || directory || (selected && selected !== detail.summary.id)
      ? []
      : active === 'Members'
        ? (detail.members?.map((member) => member.player) ?? [])
        : active === 'Applications'
          ? (detail.applications?.map((application) => application.player) ??
            [])
          : active === 'Audit'
            ? (detail.audit?.map((entry) => entry.actor) ?? [])
            : active === 'Board'
              ? (detail.posts?.map((post) => post.author) ?? [])
              : []
  useProfilePlayers(visiblePlayers)
  return (
    <AllianceDraftContext.Provider value={drafts}>
      <section className={styles.screen} aria-label="Alliances">
        <div className={styles.actions}>
          <Button variant="secondary" onClick={own} disabled={busy}>
            My alliance
          </Button>
          <Button variant="secondary" onClick={() => browse()} disabled={busy}>
            Discover alliances
          </Button>
          <Button
            variant="secondary"
            onClick={() => void controller.refresh()}
            disabled={busy}
          >
            Refresh alliance
          </Button>
        </div>
        {state.error && <p role="alert">{state.error}</p>}
        {state.pending && !state.busy && (
          <div className={styles.review}>
            <p>
              The last command may have reached the server. Retry the same
              command to confirm its result before making another change.
            </p>
            <Button
              onClick={() => {
                void controller.retry().then((ok) => {
                  if (ok) {
                    if (
                      state.pending &&
                      identityActions.has(state.pending.action.type)
                    )
                      refreshProfiles()
                    setSelected(undefined)
                    setDirectory(false)
                  }
                })
              }}
            >
              Retry last command
            </Button>
          </div>
        )}
        {state.notice && <p role="status">{state.notice}</p>}
        {state.loading && <p role="status">Loading alliances…</p>}
        {selected && selected !== detail?.summary.id ? (
          <>
            <Button variant="secondary" onClick={() => setSelected(undefined)}>
              Back to alliances
            </Button>
            {publicAlliance.error ? (
              <>
                <p role="alert">{publicAlliance.error}</p>
                <Button onClick={publicAlliance.retry}>
                  Retry public profile
                </Button>
              </>
            ) : publicAlliance.data ? (
              <>
                <Summary summary={publicAlliance.data.summary} />
                <Markdown text={publicAlliance.data.public_text} />
                <Recruit
                  summary={publicAlliance.data.summary}
                  view={state.view}
                  run={run}
                  busy={busy}
                />
              </>
            ) : (
              <p role="status">Loading public alliance…</p>
            )}
          </>
        ) : (
          state.view &&
          (!directory && detail ? (
            <>
              <Summary summary={detail.summary} />
              <ButtonLinkAnchor
                variant="secondary"
                href={`/alliances/${universe}/${detail.summary.id}`}
              >
                Public recruitment page
              </ButtonLinkAnchor>
              <nav className={styles.tabs} aria-label="Alliance sections">
                {tabs.map((name) => (
                  <Button
                    key={name}
                    variant={active === name ? 'primary' : 'secondary'}
                    onClick={() => setTab(name)}
                    aria-current={active === name ? 'page' : undefined}
                  >
                    {name}
                  </Button>
                ))}
              </nav>
              {active === 'Board' && (
                <Board
                  detail={detail}
                  player={player}
                  run={run}
                  busy={busy}
                  load={(cursor) =>
                    void controller.refresh({
                      type: 'Detail',
                      alliance: detail.summary.id,
                      post_before: cursor,
                    })
                  }
                />
              )}
              {active === 'Members' && (
                <Roster detail={detail} player={player} run={run} busy={busy} />
              )}
              {active === 'Applications' && (
                <Applications detail={detail} run={run} busy={busy} />
              )}
              {active === 'Roles' && (
                <Roles detail={detail} run={run} busy={busy} />
              )}
              {active === 'Settings' && (
                <Settings
                  detail={detail}
                  player={player}
                  run={run}
                  busy={busy}
                />
              )}
              {active === 'Audit' && <Audit detail={detail} />}
            </>
          ) : (
            <>
              <div className={styles.hero}>
                <h2>Find your people among the stars.</h2>
                <p>
                  Build an alliance, recruit commanders and plan your next
                  chapter together.
                </p>
              </div>
              <form
                className={styles.actions}
                onSubmit={(e) => {
                  e.preventDefault()
                  browse()
                }}
              >
                <Field>
                  Find an alliance
                  <Input
                    type="search"
                    value={search}
                    maxLength={48}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={busy}>
                  Search alliances
                </Button>
              </form>
              <div className={styles.grid}>
                {(state.directory?.directory ?? []).map((summary) => (
                  <article className={styles.card} key={summary.id}>
                    <Summary summary={summary} />
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(summary.id)}
                    >
                      View {summary.tag}
                    </Button>
                  </article>
                ))}
              </div>
              {!state.directory?.directory.length && (
                <p>
                  No alliances found. Search for a name or tag, or start your
                  own.
                </p>
              )}
              <nav
                className={styles.actions}
                aria-label="Alliance directory pages"
              >
                <Button
                  variant="secondary"
                  disabled={busy || offset === 0}
                  onClick={() => browse(Math.max(0, offset - 20))}
                >
                  Previous alliances
                </Button>
                <span>{state.directory?.directory_count ?? 0} alliances</span>
                <Button
                  variant="secondary"
                  disabled={
                    busy ||
                    offset + (state.directory?.directory.length ?? 0) >=
                      (state.directory?.directory_count ?? 0)
                  }
                  onClick={() =>
                    browse(offset + (state.directory?.directory.length ?? 0))
                  }
                >
                  More alliances
                </Button>
              </nav>
              {!detail && (
                <>
                  <details className={styles.card}>
                    <summary>Create an alliance</summary>
                    <ActionForm
                      draftKey="create"
                      label="Create alliance"
                      busy={busy}
                      onSubmit={(data) =>
                        run({
                          type: 'Create',
                          name: value(data, 'name'),
                          tag: value(data, 'tag'),
                        })
                      }
                    >
                      <p>
                        Creation is free. You become leader and all your pending
                        applications are withdrawn.
                      </p>
                      <Field>
                        Alliance name
                        <Input
                          name="name"
                          required
                          minLength={3}
                          maxLength={48}
                        />
                      </Field>
                      <Field>
                        Alliance tag
                        <Input
                          name="tag"
                          required
                          minLength={3}
                          maxLength={8}
                          pattern="[A-Za-z0-9]{3,8}"
                        />
                      </Field>
                    </ActionForm>
                  </details>
                  <h3>
                    Your applications ({state.view.applications.length}/5)
                  </h3>
                  {state.view.applications.map((application) => (
                    <article className={styles.card} key={application.id}>
                      <h4>[{application.alliance_tag}]</h4>
                      <Markdown text={application.text} />
                      <ConfirmAction
                        label={`Withdraw ${application.alliance_tag}`}
                        description={`Withdraw your application to [${application.alliance_tag}]?`}
                        disabled={busy}
                        onConfirm={() =>
                          run({ type: 'Withdraw', application: application.id })
                        }
                      />
                    </article>
                  ))}
                </>
              )}
            </>
          ))
        )}
      </section>
    </AllianceDraftContext.Provider>
  )
}
function Recruit({
  summary,
  view,
  run,
  busy,
}: {
  summary: components['schemas']['AllianceSummary']
  view: components['schemas']['AllianceView'] | null
  run: Run
  busy: boolean
}) {
  if (!view) return null
  if (view.alliance)
    return (
      <p>You already belong to an alliance. Leave it before joining another.</p>
    )
  if (
    view.applications.some((application) => application.alliance === summary.id)
  )
    return <p>You have a pending application to this alliance.</p>
  if (summary.recruitment === 'Closed')
    return <p>This alliance is not recruiting.</p>
  if (summary.recruitment === 'Open')
    return (
      <ConfirmAction
        label={`Join ${summary.tag}`}
        description={`Join ${summary.name}? All your pending applications will be withdrawn.`}
        disabled={busy}
        onConfirm={() => run({ type: 'Join', alliance: summary.id })}
      />
    )
  if (view.applications.length >= 5)
    return (
      <p>
        You have five pending applications. Withdraw one before applying here.
      </p>
    )
  return (
    <ActionForm
      draftKey={`application:${summary.id}`}
      label="Send application"
      busy={busy}
      onSubmit={(data) =>
        run({ type: 'Apply', alliance: summary.id, text: value(data, 'text') })
      }
    >
      <Field>
        Application message
        <textarea name="text" maxLength={4000} rows={5} />
      </Field>
    </ActionForm>
  )
}
