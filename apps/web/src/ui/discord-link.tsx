import { classes } from './classes'
import styles from './discord-link.module.css'
import { CommunityLink } from './community-link'

export function DiscordLink({
  className,
  appearance = 'button',
}: {
  className?: string
  appearance?: 'button' | 'navigation'
}) {
  if (appearance === 'navigation')
    return (
      <CommunityLink
        href="https://discord.gg/AVMHp7jUcw"
        icon={
          <img
            src="/brand/discord-symbol-white.svg"
            width="24"
            height="18"
            alt=""
          />
        }
        title="Join Discord"
        description="Talk strategy with the community"
      />
    )
  return (
    <a
      className={classes(styles.link, className)}
      href="https://discord.gg/AVMHp7jUcw"
    >
      <img
        src="/brand/discord-symbol-white.svg"
        width="28"
        height="21"
        alt=""
      />
      Join Discord
    </a>
  )
}
