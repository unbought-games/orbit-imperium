import { Plus } from 'lucide-react'
import styles from './home-details.module.css'

const questions = [
  {
    question: 'Is Orbit Imperium free to play?',
    answer: (
      <p>
        Yes. You don’t need a purchase or subscription to play. Optional
        supporter memberships and cosmetics help fund the game, but you can’t
        buy resources, faster queues, stronger fleets, or better gameplay tools.
      </p>
    ),
  },
  {
    question: 'How do I get started?',
    answer: (
      <p>
        Create an account and join a universe. You’ll start with a homeworld and
        a Briefing that introduces building, research, and fleet missions. From
        there, develop your economy, explore the galaxy, and find allies to play
        alongside.
      </p>
    ),
  },
  {
    question: 'Can I play on my phone? Do I need a download?',
    answer: (
      <p>
        Orbit Imperium runs in your browser on desktop and mobile, with no
        download or app installation. Use the same account to continue playing
        the same empire on either device.
      </p>
    ),
  },
  {
    question: 'What happens when I’m offline?',
    answer: (
      <p>
        The universe keeps running. Mines produce resources until storage is
        full, queued upgrades continue, and fleets carry out their missions.
        Other players can attack while you’re away, so planning your fleets and
        defenses is part of the game.
      </p>
    ),
  },
  {
    question: 'What can I play today?',
    answer: (
      <p>
        The game includes planetary economies, research, shipbuilding,
        colonization, espionage, combat, and alliances. We’re still adding
        features and fixing bugs. Official play takes place in Seasonal
        Universes, and you can earn permanent account rewards. Final campaigns
        are still in development; Eternal Universes aren’t available yet.
      </p>
    ),
  },
  {
    question: 'Where is the official Orbit Imperium game?',
    answer: (
      <p>
        <a href="https://unbought.games/">Unbought Games</a> develops Orbit
        Imperium and runs the official game at{' '}
        <a href="https://orbitimperium.com/">orbitimperium.com</a>. The game is
        also{' '}
        <a href="https://github.com/unbought-games/orbit-imperium">
          open source
        </a>
        , so other communities can host their own independent universes.
      </p>
    ),
  },
]

export function HomeQuestions() {
  return (
    <section
      id="questions"
      className={styles.questions}
      aria-labelledby="questions-title"
    >
      <div className={styles.questionsIntro}>
        <p className={styles.eyebrow}>Before you play</p>
        <h2 id="questions-title">Questions about Orbit Imperium</h2>
        <p>A few things to know before you settle your first planet.</p>
      </div>
      <div>
        {questions.map(({ question, answer }) => (
          <details className={styles.question} key={question}>
            <summary>
              <h3>{question}</h3>
              <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
            </summary>
            <div className={styles.answer}>{answer}</div>
          </details>
        ))}
      </div>
    </section>
  )
}
