import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

/**
 * const [confirm, confirmDialog] = useConfirm()
 * Render {confirmDialog} once; `await confirm({ title, ... })` resolves true on confirm (after the
 * optional action succeeded) and false on cancel, Escape or the overlay.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolveRef = useRef(null)
  const openerRef = useRef(null)

  const confirm = useCallback(
    options =>
      new Promise(resolve => {
        resolveRef.current = resolve
        // The control that asked: focus goes back to it when the dialog closes.
        openerRef.current = document.activeElement
        setRequest(options)
      }),
    []
  )

  const settle = useCallback(result => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setRequest(null)
  }, [])

  const returnFocus = useCallback(() => {
    const opener = openerRef.current
    if (opener && opener.isConnected && !opener.disabled) opener.focus()
  }, [])

  return [
    confirm,
    <ConfirmDialog
      key="confirm"
      request={request}
      onSettle={settle}
      onReturnFocus={returnFocus}
    />,
  ]
}
