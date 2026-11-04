import type { components } from '../../contracts'
import { Field } from '../../ui/form'
import { ActionForm, ConfirmAction, value, type Run } from './shared'
export function Recruit({
  summary,
  view,
  run,
  busy,
  initialMessage,
  messageRows = 5,
}: {
  summary: components['schemas']['AllianceSummary']
  messageRows?: number
  initialMessage?: string
  view: components['schemas']['AllianceView'] | null
  run: Run
  busy: boolean
}) {
  if (!view) return null
  if (view.alliance?.summary.id === summary.id)
    return <p role="status">You’re a member of {summary.name}.</p>
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
        <textarea
          name="text"
          maxLength={4000}
          rows={messageRows}
          defaultValue={initialMessage}
        />
      </Field>
    </ActionForm>
  )
}
