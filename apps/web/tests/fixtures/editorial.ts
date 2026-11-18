export const title = 'The Intergalactic Research Network is here'
export const announcement = {
  id: 'research-network',
  title,
  date: '2026-11-06T14:45:55Z',
  href: '/updates/research-network.html',
  image: {
    src: '/art/atlas/objects/intergalactic-research-network-640.webp',
    alt: '',
  },
  body: 'Link your laboratories so your planets research together.\n\n- Each level links one more eligible lab.\n- Research finishes faster without using another research slot.\n- Research details show which planets are contributing.',
}

export const longAnnouncement = {
  ...announcement,
  title:
    'New research, connected laboratories, and more ways to build your empire together',
  body: `${announcement.body}\n\n${'Your laboratories can now work together across your empire. Choose which planets contribute and review their progress before starting your next research project.\n\n'.repeat(6)}The final announcement paragraph.`,
}
