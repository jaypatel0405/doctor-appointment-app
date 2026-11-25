import { useState } from 'react'
import './ui.css'

/**
 * A small radio group drawn as pills (one choice of a few, e.g. the payment method).
 * Native radios underneath, visually replaced, so arrow keys and screen readers work as usual.
 * `onChange` receives the chosen value.
 */
export default function ChoiceGroup({ name, label, options, defaultValue, onChange }) {
  const [value, setValue] = useState(defaultValue ?? options[0]?.value)

  return (
    <fieldset className="ui-choice">
      <legend className="ui-choice__legend">{label}</legend>
      <div className="ui-choice__row">
        {options.map(option => {
          const Icon = option.icon
          return (
            <label key={option.value} className="ui-choice__item">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => {
                  setValue(option.value)
                  onChange?.(option.value)
                }}
              />
              <span className="ui-choice__pill">
                {Icon && <Icon size={16} aria-hidden="true" />}
                {option.label}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
