import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'
import { Popover } from '@base-ui/react/popover'
import { Check, Copy, X } from 'lucide-react'
import { Button } from './button'
import { classes } from './classes'
import {
  absoluteTimestamp,
  formatCountdown,
  type TimestampInput,
  type TimestampView,
} from './timestamp-format'
import { useTimestampClock } from './use-timestamp-clock'
import styles from './timestamp.module.css'

export type { TimestampInput, TimestampView } from './timestamp-format'
export type TimestampDisplay = {
  view: TimestampView
  text: string
  dateTime?: string
  expired: boolean
  valid: boolean
}
export type TimestampRootProps = Omit<
  ComponentProps<typeof Popover.Root>,
  'children'
> & {
  value: TimestampInput
  defaultView?: TimestampView
  view?: TimestampView
  onViewChange?: (view: TimestampView) => void
  locale?: string
  /** Defaults to the browser's zone. An IANA zone may be supplied for previews. */
  timeZone?: string
  /** Optional server-adjusted current epoch in milliseconds; update it to tick. */
  now?: number
  children: ReactNode
}

type TimestampContextValue = {
  absolute: ReturnType<typeof absoluteTimestamp>
  view: TimestampView
  select: (view: TimestampView) => void
  display: (view: TimestampView) => TimestampDisplay
}
const Context = createContext<TimestampContextValue | null>(null)
function useTimestamp() {
  const context = useContext(Context)
  if (!context) throw new Error('Timestamp parts must be inside Timestamp.Root')
  return context
}

function TimestampRoot({
  value,
  defaultView = 'countdown',
  view: controlledView,
  onViewChange,
  locale,
  timeZone,
  now,
  children,
  ...props
}: TimestampRootProps) {
  const [selection, setSelection] = useState(defaultView)
  const view = controlledView ?? selection
  const clock = useTimestampClock(now)
  const absolute = useMemo(
    () => absoluteTimestamp(value, locale, timeZone),
    [value, locale, timeZone],
  )
  const select = (next: TimestampView) => {
    if (controlledView === undefined) setSelection(next)
    onViewChange?.(next)
  }
  const display = (mode: TimestampView): TimestampDisplay => {
    const valid = absolute.milliseconds !== null
    const delta = valid ? absolute.milliseconds! - clock : 0
    const text = !valid
      ? 'Time unavailable'
      : mode === 'countdown'
        ? formatCountdown(delta)
        : absolute[mode]
    return {
      view: mode,
      text,
      dateTime: absolute.iso,
      expired: valid && delta <= 0,
      valid,
    }
  }
  return (
    <Context.Provider value={{ absolute, view, select, display }}>
      <Popover.Root {...props}>{children}</Popover.Root>
    </Context.Provider>
  )
}

export type TimestampValueProps = Omit<
  ComponentPropsWithRef<'time'>,
  'children' | 'dateTime'
> & {
  view?: TimestampView
  children?: (display: TimestampDisplay) => ReactNode
}
function TimestampValue({
  view: override,
  children,
  ...props
}: TimestampValueProps) {
  const { display, view } = useTimestamp()
  const value = display(override ?? view)
  return (
    <time {...props} dateTime={value.dateTime}>
      {children ? children(value) : value.text}
    </time>
  )
}

export type TimestampTriggerProps = ComponentPropsWithRef<
  typeof Popover.Trigger
> & {
  variant?: 'inline' | 'subtle' | 'chip'
  /** Keep behavior while delegating all trigger appearance to the caller. */
  unstyled?: boolean
}
function TimestampTrigger({
  className,
  variant = 'inline',
  unstyled = false,
  children,
  disabled,
  ...props
}: TimestampTriggerProps) {
  const { absolute } = useTimestamp()
  return (
    <Popover.Trigger
      {...props}
      disabled={disabled || absolute.milliseconds === null}
      className={(state) =>
        classes(
          !unstyled && styles.trigger,
          !unstyled && styles[variant],
          typeof className === 'function' ? className(state) : className,
        )
      }
    >
      {children ?? <TimestampValue />}
    </Popover.Trigger>
  )
}

const labels: Record<TimestampView, string> = {
  countdown: 'Countdown',
  local: 'Local time',
  utc: 'UTC',
}
export type TimestampOptionProps = ComponentPropsWithRef<'button'> & {
  view: TimestampView
}
function TimestampOption({
  view,
  children,
  className,
  onClick,
  ...props
}: TimestampOptionProps) {
  const context = useTimestamp()
  return (
    <Popover.Close
      render={<button type="button" {...props} />}
      className={classes(styles.option, className)}
      aria-pressed={context.view === view}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) context.select(view)
      }}
    >
      {children ?? (
        <>
          <span className={styles.optionLabel}>
            {labels[view]}
            {context.view === view && <Check size={16} aria-hidden="true" />}
          </span>
          <TimestampValue view={view} className={styles.optionValue} />
          {view === 'local' && (
            <span className={styles.zone}>
              {context.absolute.zone.replaceAll('_', ' ')}
            </span>
          )}
        </>
      )}
    </Popover.Close>
  )
}

export type TimestampCopyProps = ComponentProps<typeof Button> & {
  view: 'local' | 'utc'
}
function TimestampCopy({ view, children, ...props }: TimestampCopyProps) {
  const { absolute } = useTimestamp()
  const text = view === 'local' ? absolute.localCopy : absolute.utcCopy
  const [feedback, setFeedback] = useState<{
    text: string
    result: 'success' | 'error'
  } | null>(null)
  const result = feedback?.text === text ? feedback.result : null
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        aria-label={`Copy ${labels[view]}`}
        title={`Copy ${labels[view]}`}
        {...props}
        disabled={props.disabled || !text}
        onClick={async (event) => {
          props.onClick?.(event)
          if (event.defaultPrevented) return
          try {
            await navigator.clipboard.writeText(text)
            setFeedback({ text, result: 'success' })
          } catch {
            setFeedback({ text, result: 'error' })
          }
        }}
      >
        {children ??
          (result === 'success' ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          ))}
      </Button>
      <span
        role="status"
        className={result === 'error' ? styles.copyError : styles.srOnly}
      >
        {result === 'success'
          ? `${labels[view]} copied`
          : result === 'error'
            ? 'Clipboard unavailable. Select and copy this value:'
            : ''}
      </span>
      {result === 'error' && (
        <input
          className={styles.copyFallback}
          aria-label={`${labels[view]} to copy`}
          readOnly
          value={text}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </>
  )
}

export type TimestampContentProps = ComponentPropsWithRef<
  typeof Popover.Popup
> & {
  positionerProps?: ComponentProps<typeof Popover.Positioner>
  portalProps?: ComponentProps<typeof Popover.Portal>
}
function TimestampContent({
  children,
  className,
  positionerProps,
  portalProps,
  ...props
}: TimestampContentProps) {
  return (
    <Popover.Portal {...portalProps}>
      <Popover.Positioner
        sideOffset={8}
        align="start"
        positionMethod="fixed"
        sticky
        collisionAvoidance={{ side: 'shift', align: 'shift' }}
        collisionPadding={12}
        className={styles.positioner}
        {...positionerProps}
      >
        <Popover.Popup
          {...props}
          className={(state) =>
            classes(
              styles.popup,
              typeof className === 'function' ? className(state) : className,
            )
          }
        >
          {children ?? (
            <>
              <header className={styles.header}>
                <Popover.Title className={styles.title}>
                  Time display
                </Popover.Title>
                <Popover.Close
                  render={
                    <Button
                      variant="ghost"
                      size="icon-touch"
                      aria-label="Close time display"
                    />
                  }
                >
                  <X size={16} aria-hidden="true" />
                </Popover.Close>
              </header>
              <Popover.Description className={styles.description}>
                Choose how this time appears. Copy an exact time to coordinate.
              </Popover.Description>
              <div className={styles.options}>
                {(['countdown', 'local', 'utc'] as const).map((view) => (
                  <div className={styles.row} key={view}>
                    <TimestampOption view={view} />
                    {(view === 'local' || view === 'utc') && (
                      <TimestampCopy view={view} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  )
}

export type TimestampProps = Omit<TimestampRootProps, 'children'> & {
  children?: TimestampValueProps['children']
  variant?: TimestampTriggerProps['variant']
  className?: string
  render?: TimestampTriggerProps['render']
  triggerProps?: Omit<TimestampTriggerProps, 'children'>
  contentProps?: TimestampContentProps
}
function TimestampComponent({
  children,
  variant,
  className,
  render,
  triggerProps,
  contentProps,
  ...props
}: TimestampProps) {
  return (
    <TimestampRoot {...props}>
      <TimestampTrigger
        variant={variant}
        className={className}
        render={render}
        {...triggerProps}
      >
        <TimestampValue>{children}</TimestampValue>
      </TimestampTrigger>
      <TimestampContent {...contentProps} />
    </TimestampRoot>
  )
}

/** Convenient defaults plus independently composable Base UI-backed parts. */
export const Timestamp = Object.assign(TimestampComponent, {
  Root: TimestampRoot,
  Trigger: TimestampTrigger,
  Value: TimestampValue,
  Content: TimestampContent,
  Option: TimestampOption,
  Copy: TimestampCopy,
  Title: Popover.Title,
  Description: Popover.Description,
  Close: Popover.Close,
})
