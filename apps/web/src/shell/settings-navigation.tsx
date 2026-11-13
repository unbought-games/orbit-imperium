import type { BoundView } from '../client-model/commands'
import {
  ArrowLeft,
  ChevronRight,
  SlidersHorizontal,
  UserRound,
  Shield,
  HeartHandshake,
  LogOut,
  Trash2,
  Trophy,
} from 'lucide-react'
import { Link } from '../ui/link'
import { ContextNavigation, ContextNavigationGroup } from './context-navigation'
import {
  settingsSections,
  settingsSectionAvailable,
  type SettingsSection,
} from './settings-navigation-model'
import { routeTarget } from './route-target'
import { useRewardsVisible } from './community-rewards-context'

export function SettingsNavigation({
  universeName,
  body,
  appearance = 'sidebar',
  protocol,
}: {
  universeName: string
  body?: string
  protocol: BoundView['protocol']
  appearance?: 'sidebar' | 'page'
}) {
  const rewardsVisible = useRewardsVisible()
  function destination(section: SettingsSection, Icon: typeof Shield) {
    if (!settingsSectionAvailable(section, protocol)) return null
    return (
      <Link
        {...routeTarget(universeName, 'settings', body, section)}
        activeOptions={{ exact: true }}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{settingsSections[section]}</span>
        {appearance === 'page' && <ChevronRight size={16} aria-hidden="true" />}
      </Link>
    )
  }
  return (
    <ContextNavigation
      title="Settings"
      appearance={appearance}
      back={
        <Link
          {...routeTarget(
            universeName,
            appearance === 'page' ? 'menu' : 'overview',
            body,
          )}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          {appearance === 'page' ? 'Back to Menu' : 'Back to game'}
        </Link>
      }
    >
      <ContextNavigationGroup>
        {destination('identity', UserRound)}
        {destination('game', SlidersHorizontal)}
        {rewardsVisible && (
          <Link
            {...routeTarget(universeName, 'rewards', body)}
            activeOptions={{ exact: true }}
          >
            <Trophy size={18} aria-hidden="true" />
            <span>Rewards</span>
            {appearance === 'page' && (
              <ChevronRight size={16} aria-hidden="true" />
            )}
          </Link>
        )}
      </ContextNavigationGroup>
      <ContextNavigationGroup label="Information">
        {destination('support', HeartHandshake)}
      </ContextNavigationGroup>
      <ContextNavigationGroup label="Account">
        {destination('session', LogOut)}
        {destination('deletion', Trash2)}
      </ContextNavigationGroup>
    </ContextNavigation>
  )
}
