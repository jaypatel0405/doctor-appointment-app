import { useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { CircleAlert } from 'lucide-react'
import './ui.css'

/**
 * The app's confirm dialog (Radix AlertDialog: focus trapped, Escape and the cancel button close,
 * focus returns to the control that opened it). Driven by useConfirm().
 *
 * request: { title, description, confirmLabel, cancelLabel, tone, action }
 * - confirmLabel null shows only the cancel button (an explanation, not a question).
 * - action (optional, async) runs on confirm; if it throws, its message shows inside the dialog
 *   and the dialog stays open.
 */
export default function ConfirmDialog({ request, onSettle, onReturnFocus }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = Boolean(request)

  // Keep the last request on screen while the dialog animates out.
  const [shown, setShown] = useState(request)
  if (request && request !== shown) {
    setShown(request)
    setError('')
  }
  const view = request || shown

  async function handleConfirm(event) {
    event.preventDefault()
    if (!request?.action) {
      onSettle(true)
      return
    }

    setBusy(true)
    setError('')

    try {
      await request.action()
      onSettle(true)
    } catch (actionError) {
      setError(actionError?.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={next => {
        if (!next && !busy) {
          setError('')
          onSettle(false)
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ui-dialog__overlay" />
        <AlertDialog.Content
          className="ui-dialog"
          onCloseAutoFocus={event => {
            event.preventDefault()
            onReturnFocus?.()
          }}
        >
          {view && (
            <>
              <AlertDialog.Title className="ui-dialog__title">
                {view.title}
              </AlertDialog.Title>

              {view.description ? (
                <AlertDialog.Description className="ui-dialog__text">
                  {view.description}
                </AlertDialog.Description>
              ) : (
                <AlertDialog.Description className="sr-only">
                  {view.title}
                </AlertDialog.Description>
              )}

              {error && (
                <p className="ui-dialog__error" role="alert">
                  <CircleAlert size={18} aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}

              <div className="ui-dialog__actions">
                <AlertDialog.Cancel asChild>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy}
                  >
                    {view.cancelLabel || 'Cancel'}
                  </button>
                </AlertDialog.Cancel>

                {view.confirmLabel && (
                  <AlertDialog.Action asChild>
                    <button
                      type="button"
                      className={
                        view.tone === 'danger'
                          ? 'btn btn--primary ui-dialog__danger'
                          : 'btn btn--primary'
                      }
                      onClick={handleConfirm}
                      disabled={busy}
                    >
                      {busy ? 'Working…' : view.confirmLabel}
                    </button>
                  </AlertDialog.Action>
                )}
              </div>
            </>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
