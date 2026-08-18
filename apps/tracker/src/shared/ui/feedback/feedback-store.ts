import { defineStore } from 'pinia'
import { ref } from 'vue'

export type FeedbackTone = 'neutral' | 'danger' | 'success'

export interface ConfirmRequest {
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly tone?: FeedbackTone
}

export interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: FeedbackTone
}

export const TOAST_DURATION_MS = 4_000

/**
 * The app's one channel for asking and telling.
 *
 * Confirmation is a promise rather than a callback so a caller reads top to bottom:
 * `if (!(await confirm(...))) return`. That matters because the alternative is scattering
 * "am I confirming?" booleans through every component that deletes something, which is how
 * a destructive action eventually ships without a confirmation at all.
 *
 * Native `confirm()` is deliberately avoided: it blocks the main thread, cannot be styled,
 * and on Android WebView announces the origin, which looks like a browser warning rather
 * than part of the app.
 */
export const useFeedback = defineStore('feedback', () => {
  const request = ref<ConfirmRequest | null>(null)
  const toasts = ref<Toast[]>([])

  let settle: ((accepted: boolean) => void) | undefined
  let lastToastId = 0

  function confirm(next: ConfirmRequest): Promise<boolean> {
    // Opening a second question while one is pending would strand the first promise
    // forever, quietly hanging whatever awaited it. Declining it is the safe resolution.
    settle?.(false)

    request.value = next

    return new Promise<boolean>((resolve) => {
      settle = resolve
    })
  }

  function resolve(accepted: boolean): void {
    request.value = null
    settle?.(accepted)
    settle = undefined
  }

  function notify(message: string, tone: FeedbackTone = 'neutral'): number {
    lastToastId += 1

    const id = lastToastId

    toasts.value = [...toasts.value, { id, message, tone }]
    setTimeout(() => dismiss(id), TOAST_DURATION_MS)

    return id
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return { request, toasts, confirm, resolve, notify, dismiss }
})
