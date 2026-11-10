import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  AllianceDirectoryController,
  defaultAllianceSearch,
  type AllianceSearch,
} from '../../src/client-model/alliance-directory'
import { RecruitmentDirectoryView } from '../../src/features/alliances/recruitment-directory-view'
import { summary } from './alliance.story'
export function RecruitmentStory() {
  return <DirectoryStory authenticated />
}
export function PublicRecruitmentStory() {
  return <DirectoryStory authenticated={false} />
}
function DirectoryStory({ authenticated }: { authenticated: boolean }) {
  const [query, setQuery] = useState<AllianceSearch>({
    ...defaultAllianceSearch,
    all: authenticated,
  })
  const [controller] = useState(
    () =>
      new AllianceDirectoryController(async (search) => {
        // The external directory supplies fixed pages; filtering itself is a server contract.
        const total =
          search.search || search.language === 'de'
            ? 0
            : search.language
              ? search.all
                ? 22
                : 21
              : 23
        const directory = Array.from(
          { length: Math.min(20, Math.max(0, total - search.offset)) },
          (_, i) => ({
            ...summary,
            id: `alliance-${i + search.offset}`,
            name: `Alliance ${i + search.offset}`,
            tag: `A${i + search.offset}`,
            recruitment:
              search.all && i === 0
                ? ('Closed' as const)
                : ('Application' as const),
          }),
        )
        return authenticated
          ? {
              kind: 'all',
              data: {
                binding: {
                  universe: 'u',
                  epoch: 'e',
                  account: 'a',
                  player: 'p',
                },
                request_id: 'prepared',
                sampled_at: 0,
                alliance: null,
                applications: [],
                directory_count: total,
                directory,
              },
            }
          : {
              kind: 'recruiting',
              data: {
                total,
                alliances: directory.map((summary) => ({
                  summary,
                  public_text: 'Ready to explore.',
                })),
              },
            }
      }),
  )
  const state = useStore(controller.store)
  useEffect(() => {
    void controller.load(query)
    return () => controller.cancel()
  }, [controller, query])
  return (
    <main style={{ padding: 16 }}>
      <RecruitmentDirectoryView
        universe="universe"
        authenticated={authenticated}
        query={query}
        setQuery={setQuery}
        {...state}
        retry={() => void controller.load(query)}
      />
      <output aria-label="Directory query" style={{ overflowWrap: 'anywhere' }}>
        {JSON.stringify(query)}
      </output>
    </main>
  )
}
