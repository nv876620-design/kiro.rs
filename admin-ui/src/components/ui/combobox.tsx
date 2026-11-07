import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Simple combobox using HTML5 datalist for autocomplete
 * Works like a text input with autocomplete suggestions
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className,
}: ComboboxProps) {
  const listId = React.useId()

  return (
    <div className={cn('relative', className)}>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
    </div>
  )
}
