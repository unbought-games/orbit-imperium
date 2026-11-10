import type { SettingsDestination } from './settings'
import { allianceSections } from './sections'
import { LoadingRegion } from '../../ui/loading-region'
import { ContentColumn } from '../../ui/content-column'
import { Plus, ArrowLeft, Users } from 'lucide-react'
import { EmptyState } from '../../ui/empty-state'
import { TaskHeader } from '../../ui/task-header'
import { CreateAlliance } from './create'
import { useGameScreen } from '../../shell/screen-context'
import { routeTarget } from '../../shell/route-target'
import { trackRecruitment } from '../../adapters/optional-services'
import { Recruit } from './recruit'
import { RecruitmentDirectory } from './recruitment-directory'
import { AllianceWelcome } from './welcome'
import { commandId } from '../../adapters/command-id'
import {
  useProfilePlayers,
  useRefreshPlayerProfiles,
} from '../../shell/player-profiles-context'
import { AllianceDrafts, AllianceDraftContext } from './drafts'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { bindingKey } from '../../client-model/commands'
import { AlliancesController } from '../../client-model/alliances'
import type { Coordinator } from '../../client-model/coordinator'
import { useGameSession } from '../../shell/session-context'
import { Button, ButtonLink } from '../../ui/button'
import { ConfirmAction, Markdown, Summary, type Run } from './shared'
import { usePublicAlliance } from '../../client-model/use-public-alliance'
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
export function AllianceScreen({
  creating = false,
  discovering = false,
}: {
  creating?: boolean
  discovering?: boolean
}) {
  const { model, view } = useGameSession()
  const { universeName, body } = useGameScreen()
  const search = useSearch({ strict: false }) as {
    alliance?: string
    welcome?: string
    invitation?: string
  }
  if (!creating && !discovering && search.alliance)
    return (
      <Navigate
        {...routeTarget(universeName, 'alliance-discover', body?.id)}
        search={search}
        hash
        replace
      />
    )
  return (
    <AllianceWorkspace
      key={bindingKey(view.binding)}
      creating={creating}
      discovering={discovering}
      model={model}
      universe={view.binding.universe}
      player={view.binding.player}
      initialAlliance={search.alliance}
      welcome={search.welcome === '1'}
      invitation={search.invitation}
    />
  )
}
function AllianceWorkspace({
  creating,
  discovering,
  model,
  universe,
  player,
  initialAlliance,
  welcome,
  invitation,
}: {
  creating: boolean
  discovering: boolean
  model: Coordinator
  universe: string
  player: string
  initialAlliance?: string
  welcome: boolean
  invitation?: string
}) {
  const { universeName, body } = useGameScreen()
  const navigate = useNavigate()
  const allianceTarget = routeTarget(universeName, 'alliance', body?.id)
  const discoveryTarget = routeTarget(
    universeName,
    'alliance-discover',
    body?.id,
  )
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
  const [settingsSection, setSettingsSection] =
    useState<SettingsDestination>('Profile')
  const [selected, setSelected] = useState<string | undefined>(initialAlliance)
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
    !welcome && selected && selected !== detail?.summary.id
      ? selected
      : undefined,
  )
  const busy = state.busy || state.loading || !!state.pending
  const complete = (action: Parameters<Run>[0]) => {
    if (action.type === 'Join') trackRecruitment('joined')
    if (action.type === 'Apply') trackRecruitment('applied')
    if (identityActions.has(action.type)) refreshProfiles()
    setSelected(undefined)
    if (creating || discovering) void navigate(allianceTarget)
  }
  const run: Run = async (action) => {
    const ok = await controller.run(action)
    if (ok) complete(action)
    return ok
  }
  const retryCommand = async () => {
    const pending = controller.store.getState().pending
    if (pending && (await controller.retry())) complete(pending.action)
  }
  const tabs = allianceSections(detail ?? null)
  const active = tabs.includes(tab) ? tab : 'Board'
  const visiblePlayers =
    !detail || discovering || (selected && selected !== detail.summary.id)
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
      <ContentColumn
        as="section"
        width={creating ? 'focused' : 'full'}
        className={creating || discovering ? styles.screen : styles.myAlliance}
        aria-label="Alliances"
      >
        <TaskHeader
          title={
            creating
              ? 'Create alliance'
              : discovering
                ? 'Discover alliances'
                : 'My alliance'
          }
          centered={creating}
          leading={
            (creating || discovering) && (
              <ButtonLink
                variant="ghost"
                size="small"
                activeOptions={{ exact: true }}
                {...allianceTarget}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </ButtonLink>
            )
          }
        >
          {!creating && !discovering && detail && (
            <ButtonLink variant="secondary" size="inline" {...discoveryTarget}>
              Discover alliances
            </ButtonLink>
          )}
          {!creating && state.view && !detail && (
            <ButtonLink
              {...routeTarget(universeName, 'alliance-create', body?.id)}
            >
              <Plus size={16} aria-hidden="true" />
              Create Alliance
            </ButtonLink>
          )}
        </TaskHeader>
        {welcome && initialAlliance ? (
          <AllianceWelcome
            universe={universe}
            alliance={initialAlliance}
            invitation={invitation}
            view={state.view}
            run={run}
            busy={busy}
            error={state.error}
            retry={() => void controller.refresh()}
            pending={!!state.pending && !state.busy}
            retryCommand={() => void retryCommand()}
          />
        ) : (
          <LoadingRegion
            contentClassName={styles.stack}
            loading={state.loading && !state.view}
            label="Loading alliances…"
          >
            {state.error && (
              <div>
                <p role="alert">{state.error}</p>
                {!state.view && !state.pending && (
                  <Button
                    variant="secondary"
                    onClick={() => void controller.refresh()}
                  >
                    Try again
                  </Button>
                )}
              </div>
            )}
            {state.pending && !state.busy && (
              <div className={styles.review}>
                <p>
                  The last command may have reached the server. Retry the same
                  command to confirm its result before making another change.
                </p>
                <Button onClick={() => void retryCommand()}>
                  Retry last command
                </Button>
              </div>
            )}
            {state.notice && <p role="status">{state.notice}</p>}
            {creating ? (
              state.view &&
              (detail ? (
                <p>
                  You already belong to an alliance. Leave it before creating
                  another.
                </p>
              ) : (
                <CreateAlliance run={run} busy={busy} />
              ))
            ) : selected && selected !== detail?.summary.id ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setSelected(undefined)}
                >
                  Back to alliances
                </Button>
                <LoadingRegion
                  contentClassName={styles.stack}
                  loading={!publicAlliance.data && !publicAlliance.error}
                  label="Loading alliance…"
                >
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
                  ) : null}
                </LoadingRegion>
              </>
            ) : null}
            {!creating && state.view && (
              <div hidden={!!selected && selected !== detail?.summary.id}>
                <div className={styles.stack}>
                  {!discovering && detail ? (
                    <>
                      <Summary summary={detail.summary} />
                      <nav
                        className={styles.tabs}
                        aria-label="Alliance sections"
                      >
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
                          load={(cursor) => void controller.loadOlder(cursor)}
                        />
                      )}
                      {active === 'Members' && (
                        <Roster
                          detail={detail}
                          player={player}
                          run={run}
                          busy={busy}
                        />
                      )}
                      {active === 'Applications' && (
                        <Applications detail={detail} run={run} busy={busy} />
                      )}
                      {active === 'Roles' && (
                        <Roles detail={detail} run={run} busy={busy} />
                      )}
                      {active === 'Settings' && (
                        <Settings
                          section={settingsSection}
                          onSectionChange={setSettingsSection}
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
                      {discovering ? (
                        <RecruitmentDirectory
                          universe={universe}
                          model={model}
                          onSelect={(id) => {
                            if (id === detail?.summary.id)
                              void navigate(allianceTarget)
                            else setSelected(id)
                          }}
                        />
                      ) : (
                        <EmptyState
                          icon={Users}
                          title="You’re not in an alliance yet."
                          description="Find commanders to build and explore with, or create an alliance of your own."
                          actions={
                            <ButtonLink {...discoveryTarget}>
                              Discover alliances
                            </ButtonLink>
                          }
                        />
                      )}
                      {!discovering &&
                        !detail &&
                        state.view.applications.length > 0 && (
                          <>
                            <h3>
                              Your applications (
                              {state.view.applications.length}
                              /5)
                            </h3>
                            {state.view.applications.map((application) => (
                              <article
                                className={styles.card}
                                key={application.id}
                              >
                                <h4>[{application.alliance_tag}]</h4>
                                <Markdown text={application.text} />
                                <ConfirmAction
                                  label={`Withdraw ${application.alliance_tag}`}
                                  description={`Withdraw your application to [${application.alliance_tag}]?`}
                                  disabled={busy}
                                  onConfirm={() =>
                                    run({
                                      type: 'Withdraw',
                                      application: application.id,
                                    })
                                  }
                                />
                              </article>
                            ))}
                          </>
                        )}
                    </>
                  )}
                </div>
              </div>
            )}
          </LoadingRegion>
        )}
      </ContentColumn>
    </AllianceDraftContext.Provider>
  )
}
