import type { Announcement } from './model'
import { renderAnnouncementMarkdown } from './markdown'
import styles from './release-announcement.module.css'

export default function AnnouncementBody({
  announcement,
}: {
  announcement: Announcement
}) {
  return (
    <>
      {announcement.image && (
        <img
          className={styles.hero}
          src={announcement.image.src}
          alt={announcement.image.alt}
          width={306}
          height={170}
        />
      )}
      <div
        dangerouslySetInnerHTML={{
          __html: renderAnnouncementMarkdown(announcement.body),
        }}
      />
    </>
  )
}
