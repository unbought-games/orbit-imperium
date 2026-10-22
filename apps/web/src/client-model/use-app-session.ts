import { useEffect, useRef, type FormEvent } from 'react'
import { useStore } from 'zustand'
import { useNavigate } from '@tanstack/react-router'
import { useRuntimeController } from '../shell/bootstrap-context'
import { onPageRestore } from '../adapters/runtime-controller'
import { useCommands } from './use-commands'
export function useAppSession() {
  const controller = useRuntimeController(),
    { runtime, busy, message } = useStore(controller.store)
  const errorRef = useRef<HTMLParagraphElement>(null),
    navigate = useNavigate()
  const commands = useCommands(
    runtime.status === 'authenticated' ? runtime : null,
  )
  useEffect(() => {
    if (message) errorRef.current?.focus()
  }, [message])
  useEffect(() => {
    if (commands.model?.accessLost) controller.loseAccess()
  }, [commands.model?.accessLost, controller])
  useEffect(
    () => onPageRestore(() => void controller.retry(true)),
    [controller],
  )
  useEffect(() => {
    const recovery = controller.startRecovery()
    const wake = () => {
      if (document.visibilityState !== 'hidden') recovery.wake()
    }
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      recovery.stop()
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [controller])
  const login = (event: FormEvent<HTMLFormElement>, signup: boolean) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void controller.authenticate(
      signup,
      String(data.get('name')),
      String(data.get('password')),
    )
  }
  const logout = async () => {
    if (await controller.logout()) {
      await navigate({ to: '/login', replace: true })
    }
  }
  return {
    runtime,
    busy,
    message,
    errorRef,
    commands,
    login,
    logout,
    clearMessage: controller.clearMessage,
    retry: () => void controller.retry(),
  }
}
