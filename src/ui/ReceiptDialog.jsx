import * as Dialog from '@radix-ui/react-dialog'
import { BadgeCheck, Printer, X } from 'lucide-react'
import { formatCurrency, formatDate } from '../api'
import './ui.css'

function formatIssued(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase()
  return `${day}, ${time}`
}

/**
 * The payment receipt of a completed appointment (issued by the clinic when it marks the visit
 * completed). "Print or save as PDF" uses the browser's print dialog; the print stylesheet in
 * ui.css prints the receipt alone.
 */
export default function ReceiptDialog({ appointment, onClose }) {
  const receipt = appointment?.receipt
  const open = Boolean(receipt)

  return (
    <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-dialog__overlay" />
        <Dialog.Content className="ui-dialog receipt" aria-describedby={undefined}>
          {receipt && (
            <>
              <header className="receipt__head">
                <span className="receipt__brand">
                  <span className="mark" data-mark="dots" aria-hidden="true" />
                  MediBook+
                </span>
                <Dialog.Close asChild>
                  <button type="button" className="receipt__close" aria-label="Close receipt">
                    <X size={18} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>

              <div className="receipt__title">
                <Dialog.Title className="ui-dialog__title">Payment receipt</Dialog.Title>
                <span className="receipt__paid">
                  <BadgeCheck size={16} aria-hidden="true" />
                  Paid
                </span>
              </div>

              <dl className="receipt__meta">
                <div>
                  <dt>Receipt no.</dt>
                  <dd className="receipt__number">{receipt.number}</dd>
                </div>
                <div>
                  <dt>Issued</dt>
                  <dd>{formatIssued(receipt.issuedAt)}</dd>
                </div>
              </dl>

              <dl className="receipt__parties">
                <div>
                  <dt>Billed to</dt>
                  <dd>
                    <strong>{appointment.patientName}</strong>
                    {appointment.userEmail && <span>{appointment.userEmail}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Visit</dt>
                  <dd>
                    <strong>{appointment.doctorName}</strong>
                    <span className="receipt__specialty">{appointment.specialty}</span>
                    <span>
                      {formatDate(appointment.date)} at {appointment.time}
                    </span>
                  </dd>
                </div>
              </dl>

              <table className="receipt__lines">
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Consultation fee</td>
                    <td>{formatCurrency(receipt.amount)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total paid</th>
                    <td>{formatCurrency(receipt.amount)}</td>
                  </tr>
                </tfoot>
              </table>

              <dl className="receipt__meta receipt__meta--foot">
                <div>
                  <dt>Paid by</dt>
                  <dd>{receipt.method}</dd>
                </div>
                {receipt.issuedBy && (
                  <div>
                    <dt>Issued by</dt>
                    <dd>{receipt.issuedBy}</dd>
                  </div>
                )}
              </dl>

              <p className="receipt__note">
                A computer-generated receipt from MediBook+. No signature is required.
              </p>

              <div className="ui-dialog__actions receipt__actions">
                <Dialog.Close asChild>
                  <button type="button" className="btn btn--secondary">
                    Close
                  </button>
                </Dialog.Close>
                <button type="button" className="btn btn--primary" onClick={() => window.print()}>
                  <Printer size={18} aria-hidden="true" />
                  Print or save as PDF
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
