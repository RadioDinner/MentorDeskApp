import { useState, useEffect } from 'react'

function formatUS(digits) {
  if (!digits) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

function stripDigits(value) {
  return value.replace(/\D/g, '')
}

export default function PhoneInput({ name, value = '', onChange, required, style }) {
  const [display, setDisplay] = useState('')
  const [countryCode, setCountryCode] = useState('+1')

  // Initialize from external value
  useEffect(() => {
    if (!value) { setDisplay(''); return }
    // If value already looks formatted, just display it
    const digits = stripDigits(value)
    setDisplay(formatUS(digits.slice(0, 10)))
  }, [])

  function handleInput(e) {
    const raw = e.target.value
    // Only allow digits in the national number
    const digits = stripDigits(raw).slice(0, 10)
    const formatted = formatUS(digits)
    setDisplay(formatted)
    // Fire synthetic event with full value
    const full = digits ? `${countryCode} ${formatted}` : ''
    onChange?.({ target: { name, value: full } })
  }

  function handleCodeChange(e) {
    setCountryCode(e.target.value)
    const digits = stripDigits(display)
    const full = digits ? `${e.target.value} ${formatUS(digits)}` : ''
    onChange?.({ target: { name, value: full } })
  }

  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      <select
        value={countryCode}
        onChange={handleCodeChange}
        style={{
          padding: '0.65rem 0.5rem',
          border: '1.5px solid #e5e7eb',
          borderRadius: 7,
          fontSize: '0.875rem',
          color: '#374151',
          backgroundColor: '#fff',
          flexShrink: 0,
          width: 72,
        }}
      >
        <option value="+1">+1</option>
        <option value="+44">+44</option>
        <option value="+61">+61</option>
        <option value="+64">+64</option>
        <option value="+27">+27</option>
        <option value="+234">+234</option>
        <option value="+233">+233</option>
        <option value="+254">+254</option>
        <option value="+255">+255</option>
        <option value="+256">+256</option>
        <option value="+263">+263</option>
      </select>
      <input
        type="tel"
        name={name}
        value={display}
        onChange={handleInput}
        required={required}
        placeholder="(555) 000-0000"
        style={{
          flex: 1,
          padding: '0.65rem 0.85rem',
          border: '1.5px solid #e5e7eb',
          borderRadius: 7,
          fontSize: '0.875rem',
          color: '#111827',
          backgroundColor: '#fff',
          ...style,
        }}
      />
    </div>
  )
}
