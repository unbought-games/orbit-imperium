/** Shared by public page dispatch and the generated analytics route manifest. */
export const publicRoutes = {
  empire: '/profiles/empire/:player',
  profile: '/profiles/:profile',
  commemoration: '/commemorations/:publication',
  invitation: '/invite/:universe/:token',
  directory: '/alliances/:universe',
  alliance: '/alliances/:universe/:alliance',
} as const
export function matchPublicRoute(
  route: keyof typeof publicRoutes,
  pathname: string,
) {
  const pattern = publicRoutes[route].replace(/:[a-z]+/g, '([^/]+)')
  const match = new RegExp(`^${pattern}/?$`, 'i').exec(pathname)
  if (
    match &&
    ['empire', 'profile', 'commemoration'].includes(route) &&
    !/^[0-9a-f-]+$/i.test(match[1])
  )
    return null
  return match
}
