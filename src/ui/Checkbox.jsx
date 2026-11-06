import * as RadixCheckbox from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import './ui.css'

/**
 * A checkbox on the design system (Radix Checkbox: role="checkbox", Space toggles).
 * `onChange(checked)` receives a boolean.
 */
export default function Checkbox({ id, name, checked, onChange, children, className = '' }) {
  return (
    <label className={`ui-check ${className}`.trim()} htmlFor={id}>
      <RadixCheckbox.Root
        id={id}
        name={name}
        className="ui-check__box"
        checked={checked}
        onCheckedChange={next => onChange(next === true)}
      >
        <RadixCheckbox.Indicator className="ui-check__tick">
          <Check size={14} aria-hidden="true" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span>{children}</span>
    </label>
  )
}
