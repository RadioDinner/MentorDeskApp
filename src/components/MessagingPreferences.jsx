import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'

const DEFAULT_METHODS = ['Text', 'WhatsApp', 'Telegram', 'Signal']

/**
 * MessagingPreferences — renders checkboxes for which methods a person HAS,
 * and a radio selector for which one they PREFER.
 *
 * Props:
 *   methods   — JSON array (string[]) of methods this person has, e.g. ["Text","WhatsApp"]
 *   preferred — string, the preferred method, e.g. "WhatsApp"
 *   onChange  — ({ methods: string[], preferred: string }) => void
 */
export default function MessagingPreferences({ methods = [], preferred = '', onChange }) {
  const { organizationId } = useRole()
  const [availableMethods, setAvailableMethods] = useState(DEFAULT_METHODS)

  useEffect(() => {
    if (!organizationId) return
    supabase
      .from('settings')
      .select('value')
      .eq('organization_id', organizationId)
      .eq('key', 'communication_methods')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value)
            if (Array.isArray(parsed) && parsed.length) setAvailableMethods(parsed)
          } catch { /* use defaults */ }
        }
      })
  }, [organizationId])

  const selected = Array.isArray(methods) ? methods : []

  function toggleMethod(method) {
    const next = selected.includes(method)
      ? selected.filter(m => m !== method)
      : [...selected, method]
    const nextPreferred = !next.includes(preferred) ? (next[0] || '') : preferred
    onChange({ methods: next, preferred: nextPreferred })
  }

  function setPreferred(method) {
    onChange({ methods: selected, preferred: method })
  }

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <span style={s.colLabel}>Method</span>
        <span style={s.colLabel}>Has</span>
        <span style={s.colLabel}>Preferred</span>
      </div>
      {availableMethods.map(method => {
        const has = selected.includes(method)
        const isPref = preferred === method
        return (
          <div key={method} style={s.row}>
            <span style={s.methodName}>{method}</span>
            <div style={s.checkCell}>
              <input
                type="checkbox"
                checked={has}
                onChange={() => toggleMethod(method)}
                style={s.checkbox}
              />
            </div>
            <div style={s.checkCell}>
              <input
                type="radio"
                name="preferred_messaging"
                checked={isPref}
                disabled={!has}
                onChange={() => setPreferred(method)}
                style={{ ...s.radio, opacity: has ? 1 : 0.3 }}
              />
            </div>
          </div>
        )
      })}
      {selected.length > 0 && preferred && (
        <div style={s.summary}>
          Preferred: <strong>{preferred}</strong>
        </div>
      )}
    </div>
  )
}

const s = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 0, border: '1.5px solid #e5e7eb', borderRadius: 7, overflow: 'hidden' },
  header: { display: 'grid', gridTemplateColumns: '1fr 50px 70px', padding: '0.45rem 0.75rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', gap: '0.5rem' },
  colLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' },
  row: { display: 'grid', gridTemplateColumns: '1fr 50px 70px', padding: '0.45rem 0.75rem', borderBottom: '1px solid #f3f4f6', alignItems: 'center', gap: '0.5rem' },
  methodName: { fontSize: '0.875rem', color: '#374151', fontWeight: 500 },
  checkCell: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
  checkbox: { accentColor: '#6366f1', cursor: 'pointer', width: 16, height: 16 },
  radio: { accentColor: '#6366f1', cursor: 'pointer', width: 16, height: 16 },
  summary: { padding: '0.45rem 0.75rem', fontSize: '0.78rem', color: '#6b7280', backgroundColor: '#f9fafb' },
}
