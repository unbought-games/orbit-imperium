import { runtimeNeedsRecovery } from './adapters/runtime'
import { UniverseEnrollment } from './features/oidc'
import { SkipLink } from './ui/skip-link'
import { ConnectionScreen } from './features/connection-screen'
import { Text } from './ui/typography'
import { bindingKey } from './client-model/commands'
import { Outlet } from '@tanstack/react-router'
import { SessionContext } from './shell/session-context'
import { useAppSession } from './client-model/use-app-session'
import { AuthContext } from './shell/auth-context'
export function App() {
  const session = useAppSession()
  const { runtime, busy, message, errorRef, commands, logout, retry } = session
  return (
    <AuthContext.Provider value={session}>
      <SkipLink />
      {runtime.status === 'anonymous' ? (
        <Outlet />
      ) : runtime.status === 'authenticated' &&
        commands.view &&
        commands.ready ? (
        <SessionContext.Provider
          key={`${commands.view.protocol}:${bindingKey(commands.view.binding)}`}
          value={{
            universeName: runtime.session.memberships.find(
              (membership) =>
                membership.universe === commands.view!.binding.universe,
            )!.universe_name,
            commands,
            view: commands.view,
            model: commands.model!,
            logout,
          }}
        >
          <Outlet />
        </SessionContext.Provider>
      ) : runtime.status === 'authenticated' &&
        runtime.game.status === 'no_membership' ? (
        <UniverseEnrollment />
      ) : (
        <ConnectionScreen
          stale={commands.model?.stale}
          message={
            runtime.status === 'authenticated' &&
            runtime.game.status === 'no_membership'
              ? 'No universe membership is available.'
              : commands.model?.message ||
                (runtimeNeedsRecovery(runtime)
                  ? 'Connection temporarily unavailable. Reconnecting automatically…'
                  : 'Unable to prepare your game. Please retry.')
          }
          busy={busy}
          retry={retry}
          logout={runtime.status === 'authenticated' ? logout : undefined}
        />
      )}{' '}
      {message && runtime.status !== 'anonymous' && (
        <Text tone="danger" role="alert" tabIndex={-1} ref={errorRef}>
          {message}
        </Text>
      )}
    </AuthContext.Provider>
  )
}
