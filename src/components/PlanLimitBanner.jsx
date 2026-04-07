import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export default function PlanLimitBanner({ entityLabel, current, max, plan }) {
  return (
    <div style={s.banner}>
      <AlertTriangle size={18} color="#92400e" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={s.title}>Plan limit reached</div>
        <div style={s.text}>
          You've used all <strong>{max} {entityLabel}</strong> included in the {plan || 'current'} plan.
          Upgrade your plan to add more.
        </div>
      </div>
      <Link to="/admin/billing" style={s.upgradeBtn}>Upgrade</Link>
    </div>
  )
}

const s = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.85rem 1.15rem',
    background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
    border: '1px solid #fbbf24',
    borderRadius: 9,
    marginBottom: '1rem',
  },
  title: {
    fontWeight: 700,
    color: '#92400e',
    fontSize: '0.85rem',
    marginBottom: '0.15rem',
  },
  text: {
    color: '#78350f',
    fontSize: '0.82rem',
    lineHeight: 1.5,
  },
  upgradeBtn: {
    padding: '0.4rem 0.9rem',
    background: '#f59e0b',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontWeight: 700,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
}
