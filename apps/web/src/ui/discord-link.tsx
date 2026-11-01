import { classes } from './classes'
import styles from './discord-link.module.css'

export function DiscordLink({ className }: { className?: string }) {
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
