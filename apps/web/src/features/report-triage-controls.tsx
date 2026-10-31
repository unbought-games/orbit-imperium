import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
  type RefObject,
} from 'react'
import { Menu } from '@base-ui/react/menu'
import {
  Archive,
  ArrowDownWideNarrow,
  Check,
  Ellipsis,
  ListChecks,
  ListFilter,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Field, Select } from '../ui/form'
import { ActionPopover } from '../ui/action-popover'
import { ActionSheet } from '../ui/action-sheet'
import { useMobileLayout } from '../ui/use-mobile-layout'
import { reportKindLabel } from './report-preview'
import {
  reportSortOptions,
  reportTypes,
  type ReportListOptions,
} from './report-list-options'
import { ReportAgeCleanup } from './report-age-cleanup'
import type { useReportCleanup } from './use-report-cleanup'
import type { components } from '../contracts'
import styles from './report-controls.module.css'

export type ReportPanel = 'sort' | 'filter' | 'more' | 'cleanup' | null
export function ReportTriageControls({
  panel,
  setPanel,
  options,
  change,
  selecting,
  setSelecting,
  archived,
  disabled,
  complete,
  reports,
  cleanup,
  now,
}: {
  panel: ReportPanel
  setPanel: Dispatch<SetStateAction<ReportPanel>>
  options: ReportListOptions
  change: (options: ReportListOptions) => void
  selecting: boolean
  setSelecting: (selected: boolean) => void
  archived: boolean
  disabled: boolean
  complete: boolean
  reports: components['schemas']['ReportHeader4'][]
  cleanup: ReturnType<typeof useReportCleanup>
  now: number
}) {
  const filterTrigger = useRef<HTMLButtonElement>(null)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const [age, setAge] = useState({ preset: '168', customHours: '24' })
  const filtered = options.kind !== 'all' || options.status !== 'all'
  const close = (target: ReportPanel) =>
    setPanel((current) => (current === target ? null : current))
  const filterForm = (
    <div className={styles.fields}>
      <Field>
        Report type
        <Select
          value={options.kind}
          onChange={(event) => change({ ...options, kind: event.target.value })}
          disabled={disabled}
        >
          <option value="all">All types</option>
          {reportTypes.map((kind) => (
            <option key={kind} value={kind}>
              {reportKindLabel(kind)}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        Status
        <Select
          value={options.status}
          onChange={(event) =>
            change({
              ...options,
              status: event.target.value as ReportListOptions['status'],
            })
          }
          disabled={disabled}
        >
          <option value="all">All reports</option>
          <option value="unread">Unread</option>
          <option value="starred">Starred</option>
        </Select>
      </Field>
    </div>
  )
  return (
    <>
      <div className={styles.tools} role="group" aria-label="Report tools">
        <Menu.Root
          open={panel === 'sort'}
          onOpenChange={(open) => (open ? setPanel('sort') : close('sort'))}
        >
          <Menu.Trigger
            render={<Button variant="ghost" size="icon" />}
            aria-label="Sort reports"
            aria-pressed={options.sort !== 'newest'}
            title={`Sort: ${reportSortOptions.find((sort) => sort.value === options.sort)?.label}`}
            disabled={disabled}
          >
            <ArrowDownWideNarrow size={16} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              align="end"
              sideOffset={6}
              className={styles.positioner}
            >
              <Menu.Popup className={styles.menu} aria-label="Sort reports">
                <Menu.RadioGroup
                  value={options.sort}
                  onValueChange={(value) =>
                    change({
                      ...options,
                      sort: value as ReportListOptions['sort'],
                    })
                  }
                >
                  {reportSortOptions.map((sort) => (
                    <Menu.RadioItem
                      closeOnClick
                      key={sort.value}
                      value={sort.value}
                      className={styles.menuItem}
                    >
                      <span className={styles.indicator}>
                        <Menu.RadioItemIndicator>
                          <Check size={16} />
                        </Menu.RadioItemIndicator>
                      </span>
                      {sort.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <Button
          ref={filterTrigger}
          variant="ghost"
          size="icon"
          aria-label="Filter reports"
          title="Filter reports"
          aria-pressed={filtered}
          aria-expanded={panel === 'filter'}
          disabled={disabled}
          onClick={() =>
            panel === 'filter' ? close('filter') : setPanel('filter')
          }
        >
          <ListFilter size={16} aria-hidden="true" />
        </Button>
        <Menu.Root
          open={panel === 'more'}
          onOpenChange={(open) => {
            if (open) {
              setPanel('more')
            } else close('more')
          }}
        >
          <Menu.Trigger
            ref={moreTrigger}
            render={<Button variant="ghost" size="icon" />}
            aria-label="More report actions"
            title="More report actions"
            disabled={disabled}
          >
            <Ellipsis size={16} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              align="end"
              sideOffset={6}
              className={styles.positioner}
            >
              <Menu.Popup
                className={styles.menu}
                aria-label="Report actions"
                finalFocus={panel === 'cleanup' ? false : undefined}
              >
                <Menu.Item
                  className={styles.menuItem}
                  onClick={() => setSelecting(!selecting)}
                >
                  <ListChecks size={16} aria-hidden="true" />
                  {selecting ? 'Cancel selection' : 'Select reports'}
                </Menu.Item>
                {!archived && (
                  <Menu.Item
                    className={styles.menuItem}
                    onClick={() => {
                      setPanel('cleanup')
                    }}
                  >
                    <Archive size={16} aria-hidden="true" />
                    Archive older reports…
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <ReportControlPanel
        title="Filter reports"
        open={panel === 'filter'}
        onClose={() => close('filter')}
        anchor={filterTrigger}
      >
        {filterForm}
      </ReportControlPanel>
      <ReportControlPanel
        title="Archive older reports"
        open={panel === 'cleanup'}
        onClose={() => close('cleanup')}
        anchor={moreTrigger}
      >
        <ReportAgeCleanup
          reports={reports}
          cleanup={cleanup}
          error={panel === 'cleanup' ? cleanup.error : ''}
          now={now}
          disabled={disabled || !complete}
          age={age}
          change={setAge}
        />
      </ReportControlPanel>
    </>
  )
}

function ReportControlPanel({
  title,
  open,
  onClose,
  anchor,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLButtonElement | null>
  children: ReactNode
}) {
  const mobile = useMobileLayout()
  const presentation = {
    title,
    open,
    onOpenChange: (next: boolean) => {
      if (!next) onClose()
    },
  }
  return mobile ? (
    <ActionSheet {...presentation} returnFocusRef={anchor}>
      {children}
    </ActionSheet>
  ) : (
    <ActionPopover {...presentation} anchorRef={anchor}>
      {children}
    </ActionPopover>
  )
}
