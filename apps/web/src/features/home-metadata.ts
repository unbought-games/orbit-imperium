import { useEffect } from 'react'
import template from '../../../../crates/transport-http/assets/home-head.html?raw'

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  )
}

export function homeHead(origin: string) {
  const json = JSON.stringify(origin).slice(1, -1).replace(/</g, '\\u003c')
  return template
    .replaceAll('__ORBIT_ORIGIN_JSON__', json)
    .replaceAll('__ORBIT_ORIGIN__', escapeHtml(origin))
}

export function useHomeMetadata(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    // The server's configured origin takes precedence over an alias hostname.
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[data-orbit-home-head][rel="canonical"]',
    )
    const origin = canonical ? new URL(canonical.href).origin : location.origin
    document
      .querySelectorAll('[data-orbit-home-head], title')
      .forEach((node) => node.remove())
    const fragment = document.createElement('template')
    fragment.innerHTML = homeHead(origin)
    document.head.append(fragment.content)
    return () => {
      document
        .querySelectorAll('[data-orbit-home-head]')
        .forEach((node) => node.remove())
      document.title = 'Orbit Imperium'
    }
  }, [enabled])
}
