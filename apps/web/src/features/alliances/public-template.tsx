import { recruitmentEntryPath } from '../../client-model/recruitment'
import type { ReactNode, CSSProperties } from 'react'
import { ButtonLinkAnchor } from '../../ui/button'
import { Markdown } from './shared'
import { RecruitmentPreferences } from './recruitment-fields'
import { AllianceArtwork, AllianceCrestMark } from './visual-identity'
import {
  defaultIdentity,
  templateText,
  templatePlacement,
  templateGallery,
  templateSections,
  type PublicAlliance,
} from './presentation-model'
import styles from './presentation.module.css'

function GameIntroduction() {
  return (
    <section className={styles.gameIntroduction}>
      <div>
        <span className={styles.eyebrow}>New to Orbit Imperium?</span>
        <h2>Your empire. A shared universe.</h2>
        <p>
          A free browser strategy game. Build worlds, research technology, and
          command fleets alongside other players. Play on desktop or mobile.
        </p>
      </div>
      <ol>
        <li>
          <strong>Make it yours</strong>
          <p>Name your world and meet your guide.</p>
        </li>
        <li>
          <strong>Meet the alliance</strong>
          <p>Join or apply as part of your arrival.</p>
        </li>
        <li>
          <strong>Start building</strong>
          <p>Your first briefing will show you the way.</p>
        </li>
      </ol>
    </section>
  )
}
export function PublicAllianceTemplate({
  data,
  action,
  preview = false,
  signinHref,
  honors,
}: {
  data: PublicAlliance
  action: ReactNode
  preview?: boolean
  signinHref?: string
  honors?: ReactNode
}) {
  const p = data.presentation,
    identity = p?.identity ?? data.summary.visual_identity ?? defaultIdentity
  const template = p?.template_id ?? 'flagship',
    content = p?.document.content ?? {},
    summary = data.summary
  const hero = templatePlacement(content.hero_media) ?? identity.banner
  const callToAction = (
    <div className={styles.invitationAction}>
      {action}
      <p>
        Play free in your browser.{' '}
        {summary.recruitment === 'Closed'
          ? 'This alliance is not recruiting right now.'
          : summary.recruitment === 'Open'
            ? 'Create your empire, then join during your arrival.'
            : 'Create your empire, then apply during your arrival. Approval is required.'}
      </p>
    </div>
  )
  const community = templateText(content, 'community_markdown')
  const facts = (
    <div className={styles.publicFacts}>
      <span>
        <strong>{summary.member_count.toLocaleString()}</strong>{' '}
        {summary.member_count === 1 ? 'commander' : 'commanders'}
      </span>
      <span>
        {summary.recruitment === 'Open'
          ? 'Open recruitment'
          : summary.recruitment === 'Application'
            ? 'Applications open'
            : 'Recruitment closed'}
      </span>
      {data.universe_name && <span>{data.universe_name}</span>}
      <RecruitmentPreferences profile={summary.recruitment_profile} />
    </div>
  )
  const about = data.public_text && (
    <section>
      <h2>A place in the universe.</h2>
      <Markdown text={data.public_text} />
    </section>
  )
  const recruitment = (
    <section>
      <h2>
        {templateText(
          content,
          'recruitment_heading',
          'A place for your kind of commander.',
        )}
      </h2>
      <Markdown
        text={templateText(
          content,
          'recruitment_markdown',
          `Build, explore, and find your people in ${summary.name}.`,
        )}
      />
      {community && (
        <div className={styles.community}>
          <Markdown text={community} />
        </div>
      )}
    </section>
  )
  return (
    <div
      className={styles.publicPage}
      data-template={template}
      style={
        {
          '--alliance-accent': identity.primary,
          '--alliance-secondary': identity.secondary,
        } as CSSProperties
      }
    >
      <header className={styles.publicNavigation}>
        <a href="/" className={styles.brand}>
          Orbit <span>Imperium</span>
        </a>
        <div>
          {!preview && (
            <>
              <a href="#about-orbit">About the game</a>
              <a
                href={
                  signinHref ??
                  `/login?${new URLSearchParams({ redirect: recruitmentEntryPath({ universe: summary.universe, alliance: summary.id }) })}`
                }
              >
                Sign in
              </a>
            </>
          )}
        </div>
      </header>
      <div className={styles.publicCanvas}>
        {template === 'transmission' ? (
          <section className={styles.transmission}>
            <aside>
              <AllianceCrestMark
                universe={summary.universe}
                identity={identity}
              />
              <span className={styles.eyebrow}>[{summary.tag}]</span>
              <h2>{summary.name}</h2>
              {identity.motto && (
                <p className={styles.motto}>{identity.motto}</p>
              )}
              <p>
                {summary.member_count}{' '}
                {summary.member_count === 1 ? 'commander' : 'commanders'}
              </p>
              {hero && (
                <AllianceArtwork universe={summary.universe} placement={hero} />
              )}
            </aside>
            <article>
              <span className={styles.eyebrow}>A transmission for you</span>
              <h1>
                {templateText(
                  content,
                  'letter_heading',
                  'You don’t have to explore alone.',
                )}
              </h1>
              <Markdown
                text={templateText(
                  content,
                  'letter_markdown',
                  data.public_text ||
                    `Commander,\n\nThere’s a place for you in ${summary.name}. Build your empire alongside people who share your ambition.`,
                )}
              />
              {templateText(content, 'signature') && (
                <p className={styles.signature}>
                  {templateText(content, 'signature')}
                </p>
              )}
              {callToAction}
              {community && (
                <div className={styles.community}>
                  <Markdown text={community} />
                </div>
              )}
            </article>
          </section>
        ) : (
          <>
            <section
              className={
                template === 'citadel'
                  ? styles.citadelHero
                  : styles.flagshipHero
              }
            >
              {template !== 'citadel' && (
                <AllianceArtwork universe={summary.universe} placement={hero} />
              )}
              <div className={styles.heroCopy}>
                <AllianceCrestMark
                  universe={summary.universe}
                  identity={identity}
                  animated
                />
                <span className={styles.eyebrow}>
                  [{summary.tag}] ·{' '}
                  {template === 'citadel'
                    ? summary.name
                    : 'An alliance in Orbit Imperium'}
                </span>
                <h1>
                  {template === 'citadel'
                    ? templateText(content, 'hero_heading', summary.name)
                    : summary.name}
                </h1>
                {identity.motto && (
                  <p className={styles.motto}>{identity.motto}</p>
                )}
                <Markdown
                  text={templateText(
                    content,
                    'hero_markdown',
                    'Build an empire with people who have your back.',
                  )}
                />
                {callToAction}
              </div>
              {template === 'citadel' && (
                <AllianceArtwork universe={summary.universe} placement={hero} />
              )}
            </section>
            {facts}
            {!preview && honors}
            <div className={styles.publicEditorial}>
              {about}
              {template === 'citadel' ? (
                <>
                  {templateSections(content).map((s, i) => (
                    <section key={i}>
                      <h2>{s.heading}</h2>
                      <Markdown text={s.markdown} />
                    </section>
                  ))}
                  {community && (
                    <section>
                      <h2>Our community</h2>
                      <Markdown text={community} />
                    </section>
                  )}
                </>
              ) : (
                recruitment
              )}
            </div>
            {template === 'citadel' && templateGallery(content).length > 0 && (
              <div className={styles.gallery}>
                {templateGallery(content).map((image, i) => (
                  <figure key={`${image.media_id}:${i}`}>
                    <AllianceArtwork
                      universe={summary.universe}
                      placement={image}
                    />
                    {image.alt && <figcaption>{image.alt}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </>
        )}
        {data.enrollment_open === false && (
          <p className={styles.enrollmentNotice}>
            New enrollment is unavailable in this universe. Existing players can
            still sign in.
          </p>
        )}
        <div id="about-orbit">
          <GameIntroduction />
        </div>
        <footer className={styles.publicFooter}>
          <span>Orbit Imperium · by Unbought Games</span>
          {!preview && (
            <ButtonLinkAnchor
              variant="ghost"
              href={`/alliances/${summary.universe}`}
            >
              Explore other alliances
            </ButtonLinkAnchor>
          )}
        </footer>
      </div>
    </div>
  )
}
