import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { TOAST_EVENT } from './toast'

const TOAST_ICONS = { success: CircleCheck, error: CircleAlert, info: Info }

const TOAST_DURATION = 4500
// Matches the .toast.is-leaving transition in shell.css.
const TOAST_EXIT = 180

export default function ToastHost() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Set())

  const later = useCallback((callback, delay) => {
    const timers = timersRef.current
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      callback()
    }, delay)

    timers.add(timer)
  }, [])

  // Fade the toast out first, then remove it.
  const dismiss = useCallback(
    id => {
      setToasts(list =>
        list.map(item => (item.id === id ? { ...item, leaving: true } : item))
      )

      later(() => {
        setToasts(list => list.filter(item => item.id !== id))
      }, TOAST_EXIT)
    },
    [later]
  )

  useEffect(() => {
    const timers = timersRef.current

    const handleToast = event => {
      const toast = event.detail

      setToasts(list => [...list, toast])

      later(() => dismiss(toast.id), TOAST_DURATION)
    }

    window.addEventListener(TOAST_EVENT, handleToast)

    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast)
      timers.forEach(timer => window.clearTimeout(timer))
      timers.clear()
    }
  }, [dismiss, later])

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}${toast.leaving ? ' is-leaving' : ''}`}
        >
          <ToastIcon type={toast.type} />
          <span>{toast.message}</span>

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ToastIcon({ type }) {
  const Icon = TOAST_ICONS[type] || Info

  return <Icon size={18} className="toast__icon" aria-hidden="true" />
}
