import type { FormEventHandler, Ref } from 'react'
import { PublicFrame } from './public-frame'
import { Button } from '../ui/button'
import { Link } from '../ui/link'
import { Form, Field, Input } from '../ui/form'
import { Heading, Text, Eyebrow } from '../ui/typography'
import styles from './login.module.css'
export function Login({
  busy,
  signup,
  redirect,
  signupEnabled,
  universeName,
  message,
  errorRef,
  onSubmit,
}: {
  busy: boolean
  signup: boolean
  redirect?: string
  signupEnabled: boolean
  universeName?: string
  message: string
  errorRef: Ref<HTMLParagraphElement>
  onSubmit: FormEventHandler<HTMLFormElement>
}) {
  return (
    <PublicFrame>
      <Eyebrow className={styles.eyebrow}>
        {signup ? 'Begin your story' : 'Welcome back'}
      </Eyebrow>
      <Heading level={1} className={styles.title}>
        {signup ? 'A new horizon awaits.' : 'Your world awaits.'}
      </Heading>
      <Text className={styles.introduction}>
        {signup
          ? 'Create your account. Build an economy, advance your technology, and find your place among the stars.'
          : 'Sign in to continue building your place among the stars.'}
      </Text>
      {signup && universeName && <Text>Join {universeName}</Text>}
      <Form
        key={String(signup)}
        className={styles.form}
        onSubmit={onSubmit}
        aria-busy={busy}
      >
        <Field>
          Account
          <Input
            className={styles.input}
            name="name"
            autoComplete="username"
            maxLength={80}
            required
            autoFocus
          />
        </Field>
        <Field>
          Password
          <Input
            className={styles.input}
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            maxLength={1024}
            required
          />
        </Field>
        {message && (
          <Text
            className={styles.error}
            tone="danger"
            role="alert"
            tabIndex={-1}
            ref={errorRef}
          >
            {message}
          </Text>
        )}
        <Button className={styles.submit} disabled={busy}>
          {busy
            ? signup
              ? 'Creating account…'
              : 'Signing in…'
            : signup
              ? 'Create account'
              : 'Sign in'}
        </Button>
      </Form>
      {(signupEnabled || signup) && (
        <Link
          to={signup ? '/login' : '/signup'}
          search={{ redirect }}
          className={styles.modeSwitch}
          disabled={busy}
        >
          {signup ? 'Back to sign in' : 'Create an account'}
        </Link>
      )}
    </PublicFrame>
  )
}
