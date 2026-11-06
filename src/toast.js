// Tiny global toast system. Any module can call showToast(); the <ToastHost />
// component (mounted once in App) listens and renders the messages.

export const TOAST_EVENT = 'medibook:toast'

let counter = 0

export function showToast(message, type = 'info') {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { id: ++counter, message: String(message), type },
    })
  )
}
