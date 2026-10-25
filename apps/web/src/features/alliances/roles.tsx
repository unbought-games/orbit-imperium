import { useState } from 'react'
import type { components } from '../../contracts'
import {
  can,
  canDelegate,
  permissionDependencies,
  permissionLabels,
  type AllianceDetail,
  type AlliancePermission,
} from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import { ActionForm, ConfirmAction, value, type Run } from './shared'
import styles from './alliances.module.css'
type Role = components['schemas']['AllianceRole']
function RoleEditor({
  detail,
  role,
  run,
  busy,
}: {
  detail: AllianceDetail
  role?: Role
  run: Run
  busy: boolean
}) {
  const [error, setError] = useState('')
  const editable =
    !role ||
    canDelegate(detail, [...role.permissions, ...role.grantable_permissions])
  return (
    <ActionForm
      draftKey={`role:${detail.summary.id}:${role?.id ?? 'new'}`}
      busy={busy || !editable}
      label={role ? 'Save role' : 'Create role'}
      onSubmit={(data) => {
        const permissions = data.getAll('permission') as AlliancePermission[]
        const grantable_permissions = data.getAll(
          'grantable',
        ) as AlliancePermission[]
        if (
          !permissionDependencies(permissions) ||
          !permissionDependencies(grantable_permissions)
        ) {
          setError(
            'Activity requires roster access. Processing applications requires viewing applications.',
          )
          return Promise.resolve(false)
        }
        setError('')
        return run({
          type: 'SaveRole',
          alliance: detail.summary.id,
          role: role?.id ?? null,
          name: value(data, 'name'),
          permissions,
          grantable_permissions,
        })
      }}
    >
      <Field>
        Role name
        <Input
          name="name"
          defaultValue={role?.name}
          required
          minLength={1}
          maxLength={48}
        />
      </Field>
      <p>
        Permissions allow members to act. Delegation allows them to grant that
        permission to others, when they also have role management access.
      </p>
      {!editable && <p>This role includes authority you cannot delegate.</p>}
      <div className={styles.permissionList}>
        {(
          Object.entries(permissionLabels) as [AlliancePermission, string][]
        ).map(([permission, label]) => (
          <div className={styles.permission} key={permission}>
            <span>{label}</span>
            <label>
              <input
                type="checkbox"
                name="permission"
                aria-label={`${label}: allow`}
                value={permission}
                defaultChecked={role?.permissions.includes(permission)}
                disabled={!detail.grantable_permissions.includes(permission)}
              />{' '}
              Allow
            </label>
            <label>
              <input
                type="checkbox"
                name="grantable"
                aria-label={`${label}: delegate`}
                value={permission}
                defaultChecked={role?.grantable_permissions.includes(
                  permission,
                )}
                disabled={!detail.grantable_permissions.includes(permission)}
              />{' '}
              Delegate
            </label>
          </div>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </ActionForm>
  )
}
export function Roles({
  detail,
  run,
  busy,
}: {
  detail: AllianceDetail
  run: Run
  busy: boolean
}) {
  return (
    <section className={styles.stack} aria-label="Alliance roles">
      <h3>Roles and delegation</h3>
      <p>
        Members combine permissions from every assigned role. The default Member
        role always supplies baseline permissions. Leadership is separate from
        custom roles.
      </p>
      {detail.roles?.map((role) => (
        <details className={styles.card} key={role.id}>
          <summary>
            {role.name}
            {role.is_default ? ' · Default' : ''}
          </summary>
          {can(detail, 'ManageRoles') ? (
            <RoleEditor detail={detail} role={role} run={run} busy={busy} />
          ) : (
            <p>
              {role.permissions.map((p) => permissionLabels[p]).join(', ') ||
                'No permissions'}
            </p>
          )}
          {!role.is_default &&
            can(detail, 'ManageRoles') &&
            canDelegate(detail, [
              ...role.permissions,
              ...role.grantable_permissions,
            ]) && (
              <ConfirmAction
                label={`Delete ${role.name}`}
                description={`Delete the ${role.name} role and remove its permissions from all members assigned to it?`}
                disabled={busy}
                onConfirm={() =>
                  run({
                    type: 'DeleteRole',
                    alliance: detail.summary.id,
                    role: role.id,
                  })
                }
              />
            )}
        </details>
      ))}
      {can(detail, 'ManageRoles') && (
        <details className={styles.card}>
          <summary>Create a custom role</summary>
          <RoleEditor detail={detail} run={run} busy={busy} />
        </details>
      )}
    </section>
  )
}
export function MemberRoles({
  detail,
  member,
  run,
  busy,
}: {
  detail: AllianceDetail
  member: components['schemas']['AllianceMember']
  run: Run
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const roles = detail.roles ?? []
  const assignable = roles.filter(
    (role) =>
      !role.is_default &&
      canDelegate(detail, [...role.permissions, ...role.grantable_permissions]),
  )
  const locked = roles.filter(
    (role) =>
      !role.is_default &&
      member.roles.includes(role.id) &&
      !assignable.includes(role),
  )
  return editing ? (
    <ActionForm
      draftKey={`member:${detail.summary.id}:${member.player}`}
      busy={busy || locked.length > 0}
      label="Save member roles"
      onSubmit={async (data) => {
        const ok = await run({
          type: 'AssignRoles',
          alliance: detail.summary.id,
          player: member.player,
          roles: data.getAll('role').map(String),
        })
        if (ok) setEditing(false)
        return ok
      }}
    >
      <p>
        Assign roles to {member.username}. Default membership permissions always
        apply.
      </p>
      {locked.length > 0 && (
        <p>This member holds a role above your delegated authority.</p>
      )}
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
      <Button
        variant="secondary"
        type="button"
        onClick={() => setEditing(false)}
      >
        Cancel role changes
      </Button>
    </ActionForm>
  ) : (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={() => setEditing(true)}
    >
      Assign roles to {member.username}
    </Button>
  )
}
