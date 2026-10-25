import { useEffect, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { components } from '../../contracts'
import { readPublicAlliance } from '../../adapters/alliances'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Markdown, Summary } from './shared'
import styles from './alliances.module.css'
export function usePublicAlliance(universe: string, alliance?: string) {
  const [store] = useState(() =>
    createStore<{
      data: components['schemas']['PublicAlliance'] | null
      error: string
    }>(() => ({ data: null, error: '' })),
  )
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    store.setState({ data: null, error: '' })
    if (alliance)
      void readPublicAlliance(universe, alliance, abort.signal)
        .then((data) => {
          if (!abort.signal.aborted) store.setState({ data })
        })
        .catch((error: unknown) => {
          if (!abort.signal.aborted)
            store.setState({
              error:
                error instanceof Error
                  ? error.message
                  : 'Alliance unavailable.',
            })
        })
    return () => abort.abort()
  }, [store, universe, alliance, retry])
  return { ...useStore(store), retry: () => setRetry((n) => n + 1) }
}
export function PublicAlliancePage({
  universe,
  alliance,
}: {
  universe: string
  alliance: string
}) {
  const { data, error, retry } = usePublicAlliance(universe, alliance)
  useEffect(() => {
    document.title = `${data?.summary.name ?? 'Alliance'} · Orbit Imperium`
  }, [data?.summary.name])
  return (
    <main id="main-content" className={styles.publicPage}>
      <a className={styles.brand} href="/">
        Orbit Imperium
      </a>
      <h1>Alliance recruitment</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <Button onClick={retry}>Retry</Button>
        </>
      ) : data ? (
        <>
          <Summary summary={data.summary} />
          <section className={styles.card}>
            <Markdown
              text={
                data.public_text ||
                'This alliance has not published a recruitment message.'
              }
            />
          </section>
          <p>
            Already playing in this universe? Sign in to join or apply. Joining
            requires an existing universe membership.
          </p>
          <ButtonLinkAnchor
            href={`/u/${encodeURIComponent(universe)}/alliance?alliance=${encodeURIComponent(alliance)}`}
          >
            Open alliance in game
          </ButtonLinkAnchor>
          <p className={styles.meta}>
            The roster, member activity and alliance noticeboard are private.
          </p>
        </>
      ) : (
        <p role="status">Loading alliance…</p>
      )}
    </main>
  )
}
