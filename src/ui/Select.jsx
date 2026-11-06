import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
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
  const hasEmptyOption = options.some(option => option.value === '')
  const radixValue = value === '' ? (hasEmptyOption ? EMPTY : '') : value

  return (
    <RadixSelect.Root
      name={name}
      value={radixValue}
      onValueChange={next => onChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
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
          collisionPadding={16}
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
