import { describe, expect, it } from 'vitest'
import { auditAction, auditSubject, type AuditEntry } from './audit-model'
const entry: AuditEntry = {
  id: 'event',
  actor: 'leader',
  actor_name: 'Leader',
  action: 'Accept',
  target: 'application',
  at: 0,
}
const detail: Parameters<typeof auditSubject>[1] = {
  members: [{ player: 'nova', username: 'Nova', joined_at: 0, roles: [] }],
  audit: [{ ...entry, id: 'application', actor: 'nova', action: 'Apply' }],
}

describe('audit readability', () => {
  it('resolves accepted applications from their retained Apply event and trusts recorded subjects', () => {
    expect(auditSubject(entry, detail)).toEqual({
      kind: 'Player',
      player: 'nova',
      label: 'Nova',
    })
    expect(
      auditSubject(
        { ...entry, subject: { kind: 'Role', label: 'Historical name' } },
        detail,
      ),
    ).toEqual({ kind: 'Role', label: 'Historical name' })
    expect(auditSubject({ ...entry, target: 'missing' }, detail)?.label).toBe(
      'Former applicant',
    )
  })
  it('does not confuse role and notice IDs with players, or claim old pin direction', () => {
    expect(
      auditSubject({ ...entry, action: 'DeleteRole' }, detail)?.label,
    ).toBe('Deleted role')
    expect(auditSubject({ ...entry, action: 'EditPost' }, detail)?.label).toBe(
      'Unavailable notice',
    )
    expect(auditAction({ ...entry, action: 'PinPost' })).toBe(
      'Changed notice pin',
    )
    expect(auditAction({ ...entry, action: 'PinNotice' })).toBe('Pinned notice')
    expect(auditAction({ ...entry, action: 'UnpinPost' })).toBe(
      'Unpinned notice',
    )
    expect(auditAction({ ...entry, action: 'SetInvitation' })).toBe(
      'Changed invitation link',
    )
    expect(auditAction({ ...entry, action: 'SaveRole', target: null })).toBe(
      'Created role',
    )
  })
})
