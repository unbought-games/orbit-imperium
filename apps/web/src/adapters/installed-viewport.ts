/** Configure the viewport once, before rendering the iOS Home Screen app. */
export function configureInstalledViewport() {
  // Apple's standalone flag covers iPhone and iPad without user-agent sniffing.
  // Browser tabs and installed apps on other platforms keep their normal zoom.
  if (!('standalone' in navigator) || navigator.standalone !== true) return

  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  )
  if (viewport) viewport.content += ', maximum-scale=1, user-scalable=no'
  document.documentElement.dataset.iosStandalone = ''

  // WebKit also exposes native pinch gestures. Cancel those explicitly without
  // cancelling touch events used for scrolling, tapping, or selecting text.
  const preventZoom = (event: Event) => event.preventDefault()
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, preventZoom, { passive: false })
  }
}
