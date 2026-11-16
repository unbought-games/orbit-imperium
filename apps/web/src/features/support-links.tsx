import { ArrowUpRight } from 'lucide-react'
import { ButtonLinkAnchor } from '../ui/button'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import styles from './support-links.module.css'

const supportLinks = [
  {
    title: 'BrowserGamesTop',
    detail: 'No account needed. Vote once every 24 hours.',
    action: 'Vote',
    label: 'Vote on BrowserGamesTop',
    href: 'https://browsergamestop.com/vote/orbit-imperium',
  },
  {
    title: 'Foundplay',
    detail: 'Choose Upvote on our listing. Sign-in may be required.',
    action: 'Upvote',
    label: 'Upvote on Foundplay',
    href: 'https://foundplay.io/games/orbit-imperium',
  },
  {
    title: 'Orbit Imperium on GitHub',
    detail: 'Star our open-source game. GitHub account required.',
    action: 'Star',
    label: 'Star Orbit Imperium on GitHub',
    href: 'https://github.com/unbought-games/orbit-imperium',
  },
  {
    title: 'Unbought Games on GitHub',
    detail: 'Follow the studio behind Orbit. GitHub account required.',
    action: 'Follow',
    label: 'Follow Unbought Games on GitHub',
    href: 'https://github.com/unbought-games',
  },
  {
    title: 'IndieDB',
    detail: 'Follow Orbit Imperium. Sign-in may be required.',
    action: 'Follow',
    label: 'Follow Orbit Imperium on IndieDB',
    href: 'https://www.indiedb.com/games/orbit-imperium',
  },
  {
    title: 'ModDB',
    detail: 'Follow Orbit Imperium. Sign-in may be required.',
    action: 'Follow',
    label: 'Follow Orbit Imperium on ModDB',
    href: 'https://www.moddb.com/games/orbit-imperium',
  },
] as const

export function SupportLinks() {
  return (
    <Section aria-labelledby="help-orbit-grow">
      <Heading level={2} id="help-orbit-grow">
        Help Orbit grow
      </Heading>
      <Text>
        Have a spare few seconds? A vote, star, or follow helps more players
        discover Orbit Imperium. Pick any way to help below. Thank you!
      </Text>
      <Text>These actions are optional and don’t award Renown.</Text>
      <ul className={styles.links}>
        {supportLinks.map((link) => (
          <li key={link.href} className={styles.row}>
            <div>
              <h3 className={styles.title}>{link.title}</h3>
              <p className={styles.detail}>{link.detail}</p>
            </div>
            <ButtonLinkAnchor
              variant="secondary"
              className={styles.action}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.label} (opens in a new tab)`}
            >
              {link.action} <ArrowUpRight size={16} aria-hidden="true" />
            </ButtonLinkAnchor>
          </li>
        ))}
      </ul>
    </Section>
  )
}
