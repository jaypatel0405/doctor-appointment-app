import { useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import { formatDate } from '../api'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { collisionPadding, makeRoomBelow } from './position'
import './ui.css'

// "YYYY-MM-DD" <-> a local Date (no time-zone shift).
function toDate(value) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

function toValue(date) {
  return format(date, 'yyyy-MM-dd')
}

function NavChevron({ orientation }) {
  return orientation === 'left' ? (
    <ChevronLeft size={18} aria-hidden="true" />
  ) : (
    <ChevronRight size={18} aria-hidden="true" />
  )
}

/**
 * A date field on the design system: a trigger button and a calendar popover (Radix Popover,
 * react-day-picker grid: arrows, Page Up/Down, Home/End, Enter; Escape and outside click close
 * and focus returns to the trigger). Days before `min` are disabled, today is marked.
 * `onChange` receives "YYYY-MM-DD", what a native date input's value would have been.
 */
export default function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = 'Choose a date',
  disabled = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const selected = toDate(value)
  const minDate = toDate(min)
  const [month, setMonth] = useState(() => selected || minDate || new Date())

  function handleOpenChange(next) {
    // Each opening shows the chosen date's month (or the first allowed one).
    if (next) {
      setMonth(selected || minDate || new Date())
      // The calendar is about 360px tall: make room under the field first.
      makeRoomBelow(triggerRef.current, 370)
    }
    setOpen(next)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="ui-control ui-date__trigger"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
        >
          <CalendarDays size={18} className="ui-date__icon" aria-hidden="true" />
          <span className={value ? 'ui-date__value' : 'ui-date__value is-placeholder'}>
            {selected ? formatDate(value) : placeholder}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="ui-pop ui-date__content"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={collisionPadding()}
          aria-label="Choose a date"
        >
          <DayPicker
            mode="single"
            autoFocus
            weekStartsOn={1}
            selected={selected}
            month={month}
            onMonthChange={setMonth}
            startMonth={minDate}
            disabled={minDate ? { before: minDate } : undefined}
            onSelect={date => {
              if (!date) return
              onChange(toValue(date))
              setOpen(false)
            }}
            components={{ Chevron: NavChevron }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
