import {
  activityOptions,
  experienceOptions,
  languageName,
  languageOptions,
  type RecruitmentProfile,
} from '../../client-model/recruitment'
import { Field, Select } from '../../ui/form'
import styles from './alliances.module.css'
export function RecruitmentPreferences({
  profile,
}: {
  profile?: RecruitmentProfile
}) {
  if (!profile) return null
  const labels = [
    ...(profile.languages ?? []).map(languageName),
    experienceOptions.find(({ value }) => value === profile.beginners)?.label,
    activityOptions.find(({ value }) => value === profile.activity)?.label,
  ].filter(Boolean)
  if (!labels.length) return null
  return (
    <ul className={styles.preferences} aria-label="Recruitment preferences">
      {labels.map((label) => (
        <li key={label}>{label}</li>
      ))}
    </ul>
  )
}
export function RecruitmentFields({
  profile,
}: {
  profile: RecruitmentProfile
}) {
  const languages = [
    ...languageOptions.map(([value, label]) => ({ value, label })),
    ...(profile.languages ?? [])
      .filter((code) => !languageOptions.some(([value]) => value === code))
      .map((code) => ({ value: code, label: languageName(code) })),
  ]
  return (
    <>
      <label className={styles.recruitmentToggle}>
        <input type="checkbox" name="listed" defaultChecked={profile.listed} />{' '}
        List in recruitment directory
      </label>
      <p className={styles.meta}>
        Listing is optional. Closed alliances are hidden from recruitment
        discovery. Anyone with your public link can still view your page.
      </p>
      <details className={styles.preferenceDisclosure}>
        <summary>Languages used (optional)</summary>
        <fieldset className={styles.languageChoices}>
          <legend>Select up to 12 languages</legend>
          {languages.map(({ value, label }) => (
            <label key={value}>
              <input
                type="checkbox"
                name="languages"
                value={value}
                defaultChecked={profile.languages?.includes(value)}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>
      </details>
      <Field>
        New players
        <Select
          aria-label="New players"
          name="beginners"
          defaultValue={profile.beginners ?? ''}
        >
          <option value="">Not specified</option>
          {experienceOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        Activity expectations
        <Select
          aria-label="Activity expectations"
          name="activity"
          defaultValue={profile.activity ?? ''}
        >
          <option value="">Not specified</option>
          {activityOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className={styles.meta}>
        Leave any preference unset. Activity expectations describe your group;
        the game does not enforce attendance.
      </p>
    </>
  )
}
