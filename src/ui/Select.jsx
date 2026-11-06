import { useRef, useState } from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { collisionPadding, makeRoomBelow } from './position'
import './ui.css'

// Radix reserves "" for "no value", so a real empty option (e.g. "Prefer not to say") travels
// under this key and comes back out as "".
const EMPTY = '__empty__'

/**
 * A listbox select on the design system (Radix Select underneath: keyboard, type-ahead,
 * aria-activedescendant, outside click and Escape, focus back to the trigger).
 * `onChange` receives the option's value string, exactly what a native select's
 * event.target.value would have been.
 */
export default function Select({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
  ariaLabel,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const pointerOpen = useRef(false)
  const hasEmptyOption = options.some(option => option.value === '')

  function handleOpenChange(next) {
    // Make room for the whole list under the field before it opens, but only when it opens from
    // the keyboard: Radix opens on pointerdown and measures the drag from there, so scrolling the
    // page mid-press would let the release pick whichever option lands under the pointer.
    if (next && !pointerOpen.current) {
      makeRoomBelow(triggerRef.current, Math.min(360, options.length * 44 + 10))
    }
    pointerOpen.current = false
    setOpen(next)
  }
  const radixValue = value === '' ? (hasEmptyOption ? EMPTY : '') : value

  return (
    <RadixSelect.Root
      name={name}
      value={radixValue}
      onValueChange={next => onChange(next === EMPTY ? '' : next)}
      disabled={disabled}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <RadixSelect.Trigger
        ref={triggerRef}
        onPointerDown={() => { pointerOpen.current = true }}
        onKeyDown={() => { pointerOpen.current = false }}
        id={id}
        className={`ui-control ui-select__trigger ${className}`.trim()}
        aria-label={ariaLabel}
      >
        <span className="ui-select__value">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="ui-select__chevron">
          <ChevronDown size={18} aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          className="ui-pop ui-select__content"
          position="popper"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={collisionPadding()}
        >
          <RadixSelect.Viewport className="ui-select__viewport">
            {options.map(option => (
              <RadixSelect.Item
                key={option.value || EMPTY}
                value={option.value === '' ? EMPTY : option.value}
                disabled={option.disabled}
                className="ui-select__item"
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                {option.note && (
                  <span className="ui-select__note">{option.note}</span>
                )}
                <RadixSelect.ItemIndicator className="ui-select__check">
                  <Check size={16} aria-hidden="true" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
