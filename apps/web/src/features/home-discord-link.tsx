import styles from './home-details.module.css'

export function HomeDiscordLink() {
  return (
    <a className={styles.discordButton} href="https://discord.gg/AVMHp7jUcw">
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
