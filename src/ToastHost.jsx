import { useEffect, useState } from 'react'
import { TOAST_EVENT } from './toast'

const TOAST_DURATION = 4500

export default function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const timers = new Set()

    const handleToast = event => {
      const toast = event.detail

      setToasts(list => [...list, toast])

      const timer = window.setTimeout(() => {
        setToasts(list => list.filter(item => item.id !== toast.id))
        timers.delete(timer)
      }, TOAST_DURATION)

      timers.add(timer)
    }

    window.addEventListener(TOAST_EVENT, handleToast)

    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast)
      timers.forEach(timer => window.clearTimeout(timer))
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() =>
              setToasts(list => list.filter(item => item.id !== toast.id))
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
