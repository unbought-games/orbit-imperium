# Timestamp

A timestamp is an absolute instant with a selectable presentation. This component
is a standalone foundation; existing game timestamps have not been migrated.

```tsx
import { Timestamp, type TimestampView } from './ui/timestamp'

<Timestamp value={report.createdAt} defaultView="countdown" />
<Timestamp value={arrivalAt} defaultView="utc" variant="chip" />
<Timestamp value={returnAt} defaultView="countdown">
  {({ view, text, expired }) =>
    view === 'countdown'
      ? expired ? 'Awaiting confirmation' : `Home ${text}`
      : `Home at ${text}`
  }
</Timestamp>
```

`value` accepts a `Date`, Unix **milliseconds**, or an ISO timestamp with `Z` or
an explicit offset. Zone-less strings are rejected rather than interpreted in
an observer's local zone. Invalid inputs display a disabled “Time unavailable”.
Durations without an absolute endpoint are not timestamps.

| Prop                   | Default              | Purpose                                                              |
| ---------------------- | -------------------- | -------------------------------------------------------------------- |
| `defaultView`          | `countdown`          | Initial `countdown`, `local`, or `utc` view                          |
| `view`, `onViewChange` | Uncontrolled         | Share the selected view across related timestamps                    |
| `variant`              | `inline`             | `inline`, `subtle`, or `chip` appearance                             |
| `className`, `render`  | —                    | Style the trigger or compose a custom Base UI-compatible control     |
| `children`             | Formatted time       | Render function receiving `{ view, text, dateTime, expired, valid }` |
| `locale`               | Browser locale       | Locale used for readable absolute dates                              |
| `timeZone`             | Browser zone         | Optional IANA override for the local view                            |
| `now`                  | Shared browser clock | Authoritative current epoch in milliseconds; caller updates it       |
| `triggerProps`         | —                    | Trigger ref, DOM attributes, styles, disabled state, event handlers  |
| `contentProps`         | —                    | Popup props plus `positionerProps` and `portalProps`                 |
| Base UI root props     | Base UI defaults     | `open`, `defaultOpen`, `onOpenChange`, etc.                          |

Selections belong to the mounted timestamp and are not persisted. To coordinate
a group, hold a `TimestampView` in the caller and pass `view`/`onViewChange` to
each instance. Changing `defaultView` after mount does not reset a user's choice.
A controlled `view` only changes when its owner accepts `onViewChange`.

## Composition

The convenience component composes the same exported parts available to callers:

```tsx
<Timestamp.Root value={arrivalAt} view={view} onViewChange={setView}>
  <Timestamp.Trigger unstyled render={<Button variant="secondary" />}>
    Arrival: <Timestamp.Value />
  </Timestamp.Trigger>
  <Timestamp.Content positionerProps={{ side: 'top', align: 'start' }}>
    <Timestamp.Title>Coordinate arrival</Timestamp.Title>
    <Timestamp.Description>
      Select a timezone or copy the time.
    </Timestamp.Description>
    <Timestamp.Option view="local" />
    <Timestamp.Copy view="local" />
    <Timestamp.Option view="utc" />
    <Timestamp.Copy view="utc" />
    <Timestamp.Close>Close</Timestamp.Close>
  </Timestamp.Content>
</Timestamp.Root>
```

`Trigger`, `Content`, `Title`, `Description`, and `Close` retain Base UI's `render`
composition, refs, and DOM props. `Option` accepts native button props and custom
children. `Copy` accepts shared `Button` props and custom children. `Value` accepts
`<time>` props and an optional view override; it derives its `dateTime` from the
root instant. Parts expose their own classes/styles, avoiding selectors that
reach into private markup. A custom `Content` owns its title, description, layout,
and close action. Use `portalProps.container` when inside a native `<dialog>`.

`Trigger` also accepts `unstyled` to delegate appearance completely to the caller
while retaining all behavior.

Keep the trigger out of other buttons or links; compose behaviors onto one
control with `render`. Custom controls must forward refs and DOM props. Native
keyboard activation, Escape, outside dismissal and focus return come from the
Base UI popover. The picker opens on activation, not hover.

## Time and copy contracts

- Absolute displays include the date, seconds, and zone. Local uses the browser's
  IANA zone, including daylight-saving rules. UTC is always explicit.
- UTC copies are ISO 8601 (`2026-11-13T20:02:11.000Z`). Local copies contain the
  numeric offset and IANA zone (`2026-11-13T15:02:11.000-05:00 [America/New_York]`).
  The bracketed zone is context for people; strip it before parsing as plain ISO.
  Copies retain milliseconds even though the readable display shows seconds.
- Copying does not select a view or dismiss the picker. Successful copying gets
  a checkmark and accessible status. If clipboard access fails, the picker shows
  a selectable input with the exact value for manual copying.
- Countdown is the single relative view: `in 2m 11s` for future timestamps,
  `5m ago` for past timestamps, and `now` at the deadline. It preserves seconds
  and rounds a positive partial second up. This describes time, never game-action
  completion. Use the `expired` render value to show a context-specific label
  such as “Awaiting confirmation” while waiting for authoritative game state.
- All default instances share one one-second timer, removed after the last
  subscriber unmounts. This is presentation, not scheduling. For game surfaces
  using a server-adjusted clock, pass that changing epoch as `now`; a stale `now`
  intentionally freezes presentation. The component does not fetch game state.

## Preview

The isolated component gallery includes `/?scenario=timestamp`, covering all
views, inline/subtle/chip styles, a composed button, shared controlled selection,
expiry, and invalid input. It is not included in the production entrypoint.

Run `npm run test:components -- timestamp.component.spec.ts --workers=1` for the
interaction checks and `npm test -- apps/web/src/ui/timestamp-format.test.ts` for
formatting checks.
