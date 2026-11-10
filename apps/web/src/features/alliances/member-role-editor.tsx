import { useState } from 'react'
import type { AllianceDetail } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { useAllianceDraft } from './drafts'
import { memberRoleOptions, type AllianceMember } from './roster-model'
import type { Run } from './shared'
import styles from './roster.module.css'

export function MemberRoleEditor({
  detail,
  member,
  run,
  busy,
  onClose,
}: {
  detail: AllianceDetail
  member: AllianceMember
  run: Run
  busy: boolean
  onClose: () => void
}) {
  const { assignable, locked } = memberRoleOptions(detail, member)
  const [error, setError] = useState('')
  const draft = useAllianceDraft(`member:${detail.summary.id}:${member.player}`)
  return (
    <form
      ref={draft.form}
      onChange={draft.onChange}
      className={styles.roleForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy || locked.length) return
        setError('')
        const data = new FormData(event.currentTarget)
        void run({
          type: 'AssignRoles',
          alliance: detail.summary.id,
          player: member.player,
          roles: data.getAll('role').map(String),
        }).then((ok) => {
          if (ok) {
            draft.clear()
            onClose()
          } else
            setError(
              'Could not save these roles. Close this dialog to review the alliance status.',
            )
        })
      }}
    >
      {locked.length > 0 && (
        <p className={styles.warning}>
          This member holds a role above your delegated authority.
        </p>
      )}
      <fieldset
        className={styles.roleOptions}
        disabled={busy || locked.length > 0}
      >
        <legend className={styles.srOnly}>Additional roles</legend>
        {assignable.map((role) => (
          <label key={role.id}>
            <input
              type="checkbox"
              name="role"
              value={role.id}
              defaultChecked={member.roles.includes(role.id)}
            />
            {role.name}
          </label>
        ))}
        {assignable.length === 0 && <p>No additional roles available.</p>}
      </fieldset>
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
      <div className={styles.dialogActions}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            draft.clear()
            onClose()
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || locked.length > 0 || assignable.length === 0}
        >
          Save roles
        </Button>
      </div>
    </form>
  )
}
