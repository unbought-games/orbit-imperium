import { Field, Input } from '../../ui/form'
import { ActionForm, value, type Run } from './shared'
import styles from './discovery.module.css'
export function CreateAlliance({ run, busy }: { run: Run; busy: boolean }) {
  return (
    <div className={styles.create}>
      <p>Give your alliance a name and a tag commanders will recognize.</p>
      <ActionForm
        draftKey="create"
        label="Create Alliance"
        busy={busy}
        onSubmit={(data) =>
          run({
            type: 'Create',
            name: value(data, 'name'),
            tag: value(data, 'tag'),
          })
        }
      >
        <Field>
          Alliance name
          <Input
            name="name"
            aria-label="Alliance name"
            required
            minLength={3}
            maxLength={48}
            autoComplete="off"
            aria-describedby="alliance-name-help"
          />
          <small id="alliance-name-help">3–48 characters.</small>
        </Field>
        <Field>
          Alliance tag
          <Input
            name="tag"
            aria-label="Alliance tag"
            required
            minLength={3}
            maxLength={8}
            pattern="[A-Za-z0-9]{3,8}"
            autoComplete="off"
            aria-describedby="alliance-tag-help"
          />
          <small id="alliance-tag-help">
            3–8 letters or numbers. Appears beside members’ names.
          </small>
        </Field>
        <p className={styles.creationNote}>
          Creation is free. You’ll become the leader, and any pending
          applications will be withdrawn.
        </p>
      </ActionForm>
    </div>
  )
}
