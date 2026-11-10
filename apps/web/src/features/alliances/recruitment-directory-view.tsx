import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import type { useAllianceDirectory } from '../../client-model/use-alliance-directory'
import {
  defaultAllianceSearch,
  type AllianceSearch,
} from '../../client-model/alliance-directory'
import {
  activityOptions,
  experienceOptions,
  languageOptions,
} from '../../client-model/recruitment'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Field, Input, InputGroup, InputAccessory, Select } from '../../ui/form'
import { EmptyState } from '../../ui/empty-state'
import { LoadingRegion } from '../../ui/loading-region'
import { ActionPopover } from '../../ui/action-popover'
import { ActionSheet } from '../../ui/action-sheet'
import { useMobileLayout } from '../../ui/use-mobile-layout'
import { RecruitmentPreferences } from './recruitment-fields'
import styles from './discovery.module.css'

/** Route-independent controls and results; the caller owns asynchronous directory reads. */
export function RecruitmentDirectoryView({
  universe,
  authenticated,
  onSelect,
  query,
  setQuery,
  result,
  loading,
  error,
  retry,
}: {
  universe: string
  authenticated: boolean
  onSelect?: (id: string) => void
  query: AllianceSearch
  setQuery: import('react').Dispatch<
    import('react').SetStateAction<AllianceSearch>
  >
} & ReturnType<typeof useAllianceDirectory>) {
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  const mobile = useMobileLayout()
  const summaries =
    result?.kind === 'all'
      ? result.data.directory
      : (result?.data.alliances.map((entry) => entry.summary) ?? [])
  const total =
    result?.kind === 'all'
      ? result.data.directory_count
      : (result?.data.total ?? 0)
  const filtered = !!(
    query.search ||
    query.language ||
    query.beginners ||
    query.activity ||
    (authenticated && !query.all)
  )
  const filterCount = [
    query.language,
    query.beginners,
    query.activity,
    authenticated && !query.all,
  ].filter(Boolean).length
  const change = (patch: Partial<AllianceSearch>) =>
    setQuery((current) => ({ ...current, ...patch, offset: 0 }))
  const reset = () => {
    setSearch('')
    setQuery({ ...defaultAllianceSearch, all: authenticated })
  }
  const filters = (
    <div className={styles.filterFields}>
      {authenticated && (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={!query.all}
            onChange={(e) => change({ all: !e.target.checked })}
          />
          Only show recruiting
        </label>
      )}
      <Field>
        Language
        <Select
          aria-label="Language"
          value={query.language}
          onChange={(e) => change({ language: e.target.value })}
        >
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
        <Select
          aria-label="New players"
          value={query.beginners}
          onChange={(e) =>
            change({ beginners: e.target.value as AllianceSearch['beginners'] })
          }
        >
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
        <Select
          aria-label="Activity expectations"
          value={query.activity}
          onChange={(e) =>
            change({ activity: e.target.value as AllianceSearch['activity'] })
          }
        >
          <option value="">Any activity</option>
          {activityOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        variant="secondary"
        onClick={() =>
          change({
            language: '',
            beginners: '',
            activity: '',
            all: authenticated,
          })
        }
        disabled={!filterCount}
      >
        Reset filters
      </Button>
    </div>
  )
  return (
    <section className={styles.directory} aria-label="Alliance directory">
      <div className={styles.toolbar}>
        <Button
          ref={filterTrigger}
          variant="ghost"
          size={mobile ? 'icon-touch' : 'small'}
          aria-label={`Filters${filterCount > 0 ? ` (${filterCount})` : ''}`}
          title={`Filters${filterCount > 0 ? ` (${filterCount})` : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {!mobile && <>Filters{filterCount > 0 ? ` (${filterCount})` : ''}</>}
        </Button>
        <form
          className={styles.search}
          role="search"
          aria-label="Search alliances"
          onSubmit={(e) => {
            e.preventDefault()
            change({ search: search.trim() })
          }}
        >
          <InputGroup>
            <InputAccessory>
              <Search size={16} aria-hidden="true" />
            </InputAccessory>
            <Input
              aria-label="Search alliances"
              type="search"
              placeholder="Search by name or tag"
              maxLength={48}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Button
            type="submit"
            size="small"
            className={styles.searchSubmit}
            variant="secondary"
            aria-label="Search alliances"
          >
            Search
          </Button>
        </form>
        {filtered && summaries.length > 0 && (
          <Button
            className={styles.clearFilters}
            variant="ghost"
            onClick={reset}
          >
            Clear filters
          </Button>
        )}
      </div>
      {mobile ? (
        <ActionSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          returnFocusRef={filterTrigger}
          title="Alliance filters"
        >
          {filters}
        </ActionSheet>
      ) : (
        <ActionPopover
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          anchorRef={filterTrigger}
          title="Alliance filters"
        >
          {filters}
        </ActionPopover>
      )}
      <LoadingRegion
        loading={loading}
        label="Loading alliances…"
        className={styles.results}
      >
        {error ? (
          <div className={styles.error}>
            <p role="alert">{error}</p>
            <Button variant="secondary" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            {result && !summaries.length && (
              <EmptyState
                icon={filtered ? Search : Users}
                title={
                  filtered
                    ? 'No alliances match your search.'
                    : query.all
                      ? 'No alliances yet.'
                      : 'No alliances are recruiting right now.'
                }
                description={
                  filtered
                    ? 'Try another name or tag, or clear your filters.'
                    : query.all
                      ? 'Be the first to bring commanders together. Create an alliance to get started.'
                      : authenticated
                        ? 'Check back later, or browse all alliances to find a group you know.'
                        : 'Check back later to find a group looking for new members.'
                }
                actions={
                  filtered ? (
                    <Button variant="secondary" onClick={reset}>
                      Clear filters
                    </Button>
                  ) : !query.all && authenticated ? (
                    <Button
                      variant="secondary"
                      onClick={() => change({ all: true })}
                    >
                      Show all alliances
                    </Button>
                  ) : undefined
                }
              />
            )}
            {!!summaries.length && (
              <>
                <p className={styles.resultCount}>
                  {total.toLocaleString()}{' '}
                  {total === 1 ? 'alliance' : 'alliances'}
                </p>
                <ul className={styles.list} aria-label="Alliances">
                  {summaries.map((summary) => (
                    <li key={summary.id} className={styles.row}>
                      <div className={styles.identity}>
                        <span className={styles.tag}>[{summary.tag}]</span>
                        <h3>
                          {onSelect ? (
                            <button
                              className={styles.name}
                              disabled={loading}
                              onClick={() => onSelect(summary.id)}
                            >
                              {summary.name}
                            </button>
                          ) : (
                            <a
                              className={styles.name}
                              href={`/alliances/${universe}/${summary.id}`}
                            >
                              {summary.name}
                            </a>
                          )}
                        </h3>
                        <span className={styles.members}>
                          {summary.member_count.toLocaleString()}{' '}
                          {summary.member_count === 1 ? 'member' : 'members'}
                        </span>
                        <RecruitmentPreferences
                          profile={summary.recruitment_profile}
                        />
                      </div>
                      <span
                        className={styles.status}
                        data-recruiting={summary.recruitment !== 'Closed'}
                      >
                        {summary.recruitment === 'Open'
                          ? 'Open to join'
                          : summary.recruitment === 'Application'
                            ? 'Accepting applications'
                            : 'Recruitment closed'}
                      </span>
                      {onSelect ? (
                        <Button
                          variant="ghost"
                          size="icon-touch"
                          aria-label={`View ${summary.tag}`}
                          disabled={loading}
                          onClick={() => onSelect(summary.id)}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </Button>
                      ) : (
                        <ButtonLinkAnchor
                          variant="ghost"
                          size="icon-touch"
                          aria-label={`View ${summary.tag}`}
                          href={`/alliances/${universe}/${summary.id}`}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </ButtonLinkAnchor>
                      )}
                    </li>
                  ))}
                </ul>
                {total > 20 && (
                  <nav
                    className={styles.pagination}
                    aria-label="Alliance directory pages"
                  >
                    <span>
                      {query.offset + 1}–
                      {Math.min(query.offset + summaries.length, total)} of{' '}
                      {total.toLocaleString()}
                    </span>
                    <div>
                      <Button
                        variant="ghost"
                        disabled={loading || query.offset === 0}
                        onClick={() =>
                          setQuery((current) => ({
                            ...current,
                            offset: Math.max(0, current.offset - 20),
                          }))
                        }
                      >
                        <ArrowLeft size={16} aria-hidden="true" />
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={loading || query.offset + 20 >= total}
                        onClick={() =>
                          setQuery((current) => ({
                            ...current,
                            offset: current.offset + 20,
                          }))
                        }
                      >
                        Next
                        <ArrowRight size={16} aria-hidden="true" />
                      </Button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </LoadingRegion>
    </section>
  )
}
