import { useState } from 'react'
import { useRecruitmentDirectory } from '../../client-model/use-recruitment-directory'
import { useOidcConfig } from '../../client-model/use-oidc'
import {
  activityOptions,
  experienceOptions,
  languageOptions,
} from '../../client-model/recruitment'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Field, Input, Select } from '../../ui/form'
import { Markdown, Summary } from './shared'
import styles from './alliances.module.css'
export function RecruitmentDirectory({
  universe,
  onSelect,
}: {
  universe: string
  onSelect?: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const { data, loading, error, retry } = useRecruitmentDirectory(
    universe,
    query,
  )
  const offset = Number(new URLSearchParams(query).get('offset') ?? 0)
  function page(next: number) {
    const params = new URLSearchParams(query)
    params.set('offset', String(next))
    setQuery(params.toString())
  }
  return (
    <section className={styles.stack} aria-label="Recruiting alliances">
      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault()
          const params = new URLSearchParams()
          for (const [key, value] of new FormData(event.currentTarget))
            if (String(value)) params.set(key, String(value))
          setQuery(params.toString())
        }}
      >
        <Field>
          Alliance name or tag
          <Input name="search" type="search" maxLength={48} />
        </Field>
        <Field>
          Language
          <Select aria-label="Language" name="language">
            <option value="">Any language</option>
            {languageOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          New players
          <Select aria-label="New players" name="beginners">
            <option value="">Any experience</option>
            {experienceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Activity expectations
          <Select aria-label="Activity expectations" name="activity">
            <option value="">Any activity</option>
            {activityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Find recruiting alliances</Button>
      </form>
      {loading && <p role="status">Loading recruiting alliances…</p>}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <Button onClick={retry}>Retry recruitment search</Button>
        </div>
      )}
      {data && (
        <div aria-busy={loading} className={styles.stack}>
          {!loading && !error && data.alliances.length === 0 && (
            <p>
              No recruiting alliances match. Try fewer filters or check back as
              more groups join.
            </p>
          )}
          {data.alliances.map((alliance) => (
            <article key={alliance.summary.id} className={styles.card}>
              <Summary summary={alliance.summary} />
              <Markdown
                compact
                text={
                  alliance.public_text.length > 240
                    ? `${alliance.public_text.slice(0, 240)}…`
                    : alliance.public_text ||
                      'Read this alliance’s page to learn more.'
                }
              />
              {onSelect ? (
                <Button
                  variant="secondary"
                  onClick={() => onSelect(alliance.summary.id)}
                >
                  View {alliance.summary.tag}
                </Button>
              ) : (
                <ButtonLinkAnchor
                  variant="secondary"
                  href={`/alliances/${universe}/${alliance.summary.id}`}
                >
                  View {alliance.summary.tag}
                </ButtonLinkAnchor>
              )}
            </article>
          ))}
          <nav
            className={styles.actions}
            aria-label="Recruitment directory pages"
          >
            <Button
              variant="secondary"
              disabled={loading || offset === 0}
              onClick={() => page(Math.max(0, offset - 20))}
            >
              Previous
            </Button>
            <span>
              {data.total} recruiting{' '}
              {data.total === 1 ? 'alliance' : 'alliances'}
            </span>
            <Button
              variant="secondary"
              disabled={loading || offset + 20 >= data.total}
              onClick={() => page(offset + 20)}
            >
              Next
            </Button>
          </nav>
        </div>
      )}
    </section>
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
    <main id="main-content" className={styles.publicPage}>
      <a className={styles.brand} href="/">
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
          <a className={styles.brand} href="/alliances">
            Choose another universe
          </a>
        </>
      ) : (
        <>
          <h2>Choose a universe</h2>
          {state.status === 'loading' && (
            <p role="status">Loading universes…</p>
          )}
          {state.status === 'error' && (
            <>
              <p role="alert">Unable to load universes.</p>
              <Button onClick={retry}>Try again</Button>
            </>
          )}
          {state.status === 'ready' && (
            <div className={styles.actions}>
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
                  No universes are accepting new players right now. An existing
                  alliance link can still take you to its public page.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}
