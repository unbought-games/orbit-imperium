import { useState } from 'react'
import { useAllianceDirectory } from '../../client-model/use-alliance-directory'
import {
  defaultAllianceSearch,
  type AllianceSearch,
} from '../../client-model/alliance-directory'
import type { Coordinator } from '../../client-model/coordinator'
import { useOidcConfig } from '../../client-model/use-oidc'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { LoadingRegion } from '../../ui/loading-region'
import { RecruitmentDirectoryView } from './recruitment-directory-view'
import allianceStyles from './alliances.module.css'
export function RecruitmentDirectory({
  universe,
  model,
  onSelect,
}: {
  universe: string
  model?: Coordinator
  onSelect?: (id: string) => void
}) {
  const [query, setQuery] = useState<AllianceSearch>(() => ({
    ...defaultAllianceSearch,
    all: !!model,
  }))
  const directory = useAllianceDirectory(universe, query, model)
  return (
    <RecruitmentDirectoryView
      universe={universe}
      authenticated={!!model}
      onSelect={onSelect}
      query={query}
      setQuery={setQuery}
      {...directory}
    />
  )
}

export function PublicRecruitmentDirectory({
  universe,
}: {
  universe?: string
}) {
  const { state, retry } = useOidcConfig()
  const name =
    state.status === 'ready'
      ? state.config.universes.find((u) => u.universe === universe)?.name
      : undefined
  return (
    <main id="main-content" className={allianceStyles.publicPage}>
      <a className={allianceStyles.brand} href="/">
        Orbit Imperium
      </a>
      <h1>Find your alliance</h1>
      <p>
        Find people to explore, build and compete with. Joining an alliance is
        always your choice.
      </p>
      {universe ? (
        <>
          <h2>{name ?? 'Recruiting in this universe'}</h2>
          <RecruitmentDirectory key={universe} universe={universe} />
          <a className={allianceStyles.brand} href="/alliances">
            Choose another universe
          </a>
        </>
      ) : (
        <>
          <h2>Choose a universe</h2>
          <LoadingRegion
            loading={state.status === 'loading'}
            label="Loading universes…"
          >
            {state.status === 'error' && (
              <>
                <p role="alert">Unable to load universes.</p>
                <Button onClick={retry}>Try again</Button>
              </>
            )}
            {state.status === 'ready' && (
              <div className={allianceStyles.actions}>
                {state.config.universes.length ? (
                  state.config.universes.map((u) => (
                    <ButtonLinkAnchor
                      key={u.universe}
                      href={`/alliances/${u.universe}`}
                    >
                      {u.name}
                    </ButtonLinkAnchor>
                  ))
                ) : (
                  <p>
                    No universes are accepting new players right now. An
                    existing alliance link can still take you to its public
                    page.
                  </p>
                )}
              </div>
            )}
          </LoadingRegion>
        </>
      )}
    </main>
  )
}
