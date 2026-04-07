export default function UsageBar({ label, current, max, color = '#6366f1' }) {
  const unlimited = max === Infinity || max === undefined
  const pct = unlimited ? 0 : Math.min(100, Math.round((current / max) * 100))
  const barColor = unlimited ? color : pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : color

  return (
    <div style={s.wrapper}>
      <div style={s.labelRow}>
        <span style={s.label}>{label}</span>
        <span style={s.count}>
          {current}{unlimited ? '' : ` / ${max}`}
          {unlimited && <span style={s.unlimited}> (unlimited)</span>}
        </span>
      </div>
      {!unlimited && (
        <div style={s.track}>
          <div style={{ ...s.fill, width: `${pct}%`, backgroundColor: barColor }} />
        </div>
      )}
    </div>
  )
}

const s = {
  wrapper: { width: '100%' },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.3rem',
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#374151',
  },
  count: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  unlimited: {
    fontWeight: 400,
    color: '#94a3b8',
    fontSize: '0.72rem',
  },
  track: {
    height: 5,
    borderRadius: 99,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
    transition: 'width 0.3s ease',
  },
}
