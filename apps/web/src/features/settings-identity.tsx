import { useReducer, useState } from 'react'
import type { EmpireProfile } from '../adapters/empire-history'
import { useArchive } from '../client-model/use-empire-history'
import { useGameScreen } from '../shell/screen-context'
import { IdentityEditor } from './empire-history/identity-editor'
import { Button } from '../ui/button'
import { LoadingRegion } from '../ui/loading-region'
import { Text } from '../ui/typography'

export function SettingsIdentity() {
  const { view } = useGameScreen()
  const {
    data: profile,
    loading,
    busy,
    error,
    retry,
    save,
  } = useArchive<EmpireProfile>(
    'EmpireProfile',
    `/api/v4/empire-profiles/${view.binding.player}?library=false`,
  )
  const [saved, setSaved] = useState(false)
  // Reset the edit session only after a confirmed save; refresh conflicts retain the draft.
  const [editSession, resetEditSession] = useReducer(
    (value: number) => value + 1,
    0,
  )
  return (
    <>
      {error && (
        <div role="alert">
          {error}{' '}
          <Button variant="secondary" onClick={retry}>
            Refresh
          </Button>
        </div>
      )}
      <LoadingRegion
        loading={loading && !profile}
        label="Loading empire identity…"
      >
        {profile &&
          (profile.owner &&
          !profile.removed &&
          !profile.closed &&
          profile.title_choices ? (
            <IdentityEditor
              key={editSession}
              profile={profile}
              busy={busy || loading}
              save={async (current, action) => {
                setSaved(false)
                const ok = await save(current, action)
                if (ok) {
                  setSaved(true)
                  resetEditSession()
                }
                return ok
              }}
              title={null}
              appearance="plain"
              autoFocus={false}
              related={null}
            />
          ) : (
            <Text>Identity editing is unavailable for this empire.</Text>
          ))}
      </LoadingRegion>
      {saved && <Text role="status">Empire identity saved.</Text>}
    </>
  )
}
