import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  Shield, LayoutDashboard, UserCheck, HeartHandshake, Users, Users2,
  Package, BarChart3, CreditCard, Receipt, DollarSign, ClipboardList,
  Settings, Check, ChevronDown, ChevronUp, Lock,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'

const MODULES = [
  { section: 'Main' },
  { key: 'mod_dashboard',        label: 'Dashboard',         icon: LayoutDashboard, color: '#6366f1', bg: '#eef2ff' },
  { key: 'mod_mentors',          label: 'Mentors',           icon: UserCheck,       color: '#6366f1', bg: '#eef2ff' },
  { key: 'mod_assistant_mentors', label: 'Assistant Mentors', icon: HeartHandshake,  color: '#10b981', bg: '#ecfdf5' },
  { key: 'mod_mentees',          label: 'Mentees',           icon: Users,           color: '#3b82f6', bg: '#eff6ff' },
  { key: 'mod_staff',            label: 'Staff',             icon: Users2,          color: '#f59e0b', bg: '#fffbeb' },
  { key: 'mod_offerings',        label: 'Offerings',         icon: Package,         color: '#8b5cf6', bg: '#f5f3ff', feature: 'courses' },
  { key: 'mod_reports',          label: 'Reports',           icon: BarChart3,       color: '#ec4899', bg: '#fdf2f8', feature: 'reports' },
  { section: 'Finance' },
  { key: 'mod_billing',          label: 'Billing',           icon: CreditCard,      color: '#0d9488', bg: '#f0fdfa', feature: 'billing' },
  { key: 'mod_invoicing',        label: 'Invoicing',         icon: Receipt,         color: '#0d9488', bg: '#f0fdfa', feature: 'invoicing' },
  { key: 'mod_payroll',          label: 'Payroll',           icon: DollarSign,      color: '#0d9488', bg: '#f0fdfa', feature: 'payroll' },
  { section: 'System' },
  { key: 'mod_staff_roles',      label: 'Staff Roles',       icon: Shield,          color: '#dc2626', bg: '#fef2f2' },
  { key: 'mod_audit_log',        label: 'Audit Log',         icon: ClipboardList,   color: '#64748b', bg: '#f8fafc' },
  { key: 'mod_settings',         label: 'Settings',          icon: Settings,        color: '#f59e0b', bg: '#fffbeb' },
]

const MODULE_KEYS = MODULES.filter(m => m.key).map(m => m.key)
const MODULE_MAP = {}
MODULES.filter(m => m.key).forEach(m => { MODULE_MAP[m.key] = m })

export default function ManageStaffRoles() {
  const navigate = useNavigate()
  const { organizationId, hasFeature } = useRole()
  const [staff, setStaff] = useState([])
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [expanded, setExpanded] = useState({})

  useEffect(() => { load() }, [organizationId])

  async function load() {
    setLoading(true)
    const [staffRes, permRes] = await Promise.all([
      supabase.from('staff').select('id, first_name, last_name, role_title, avatar_url, email').order('last_name'),
      supabase.from('staff_permissions').select('*'),
    ])
    if (staffRes.data) setStaff(staffRes.data)
    const permMap = {}
    if (permRes.data) permRes.data.forEach(p => { permMap[p.staff_id] = p })
    setPermissions(permMap)
    setLoading(false)
  }

  function getPerms(staffId) {
    const p = permissions[staffId] || {}
    const result = {}
    MODULE_KEYS.forEach(k => { result[k] = !!p[k] })
    return result
  }

  function isModuleAvailable(mod) {
    if (!mod.feature) return true
    return hasFeature(mod.feature)
  }

  async function togglePermission(staffId, key) {
    const mod = MODULE_MAP[key]
    if (mod && !isModuleAvailable(mod)) return

    setSaving(s => ({ ...s, [`${staffId}_${key}`]: true }))
    const current = getPerms(staffId)
    const newVal = !current[key]

    if (permissions[staffId]) {
      await supabase.from('staff_permissions').update({ [key]: newVal }).eq('staff_id', staffId)
    } else {
      const row = { staff_id: staffId, organization_id: organizationId }
      MODULE_KEYS.forEach(k => { row[k] = k === key ? newVal : false })
      const { data } = await supabase.from('staff_permissions').insert(row).select().single()
      if (data) {
        setPermissions(p => ({ ...p, [staffId]: data }))
        setSaving(s => ({ ...s, [`${staffId}_${key}`]: false }))
        return
      }
    }

    setPermissions(p => ({
      ...p,
      [staffId]: { ...p[staffId], staff_id: staffId, [key]: newVal },
    }))
    setSaving(s => ({ ...s, [`${staffId}_${key}`]: false }))
  }

  async function toggleAll(staffId, enable) {
    const update = {}
    MODULE_KEYS.forEach(k => {
      const mod = MODULE_MAP[k]
      update[k] = enable && isModuleAvailable(mod)
    })

    if (permissions[staffId]) {
      await supabase.from('staff_permissions').update(update).eq('staff_id', staffId)
    } else {
      const { data } = await supabase.from('staff_permissions').insert({ staff_id: staffId, organization_id: organizationId, ...update }).select().single()
      if (data) { setPermissions(p => ({ ...p, [staffId]: data })); return }
    }
    setPermissions(p => ({ ...p, [staffId]: { ...p[staffId], staff_id: staffId, ...update } }))
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Staff Roles & Permissions</h1>
          <p style={s.sub}>Control which admin modules each staff member can access.</p>
        </div>
      </div>

      {staff.length === 0 ? (
        <div style={s.empty}>
          <Shield size={36} color="#d1d5db" strokeWidth={1.5} />
          <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No staff members yet. Add staff first.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {staff.map(member => {
            const perms = getPerms(member.id)
            const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`
            const allAvailableOn = MODULE_KEYS.every(k => {
              const mod = MODULE_MAP[k]
              return !isModuleAvailable(mod) || perms[k]
            })
            const isOpen = !!expanded[member.id]
            const activeModules = MODULES.filter(m => m.key && perms[m.key])

            return (
              <div key={member.id} style={s.card}>
                {/* Collapsed row */}
                <div
                  style={s.cardHeader}
                  onClick={() => setExpanded(e => ({ ...e, [member.id]: !e[member.id] }))}
                >
                  <div style={s.memberInfo}>
                    <div style={s.memberAvatar}>
                      {member.avatar_url
                        ? <img src={member.avatar_url} alt="" style={s.avatarImg} />
                        : <span>{initials}</span>
                      }
                    </div>
                    <div>
                      <div style={s.memberName}>{member.first_name} {member.last_name}</div>
                      {member.role_title && <div style={s.memberRole}>{member.role_title}</div>}
                    </div>
                  </div>

                  {/* Module icons preview (when collapsed) */}
                  <div style={s.iconRow}>
                    {activeModules.length > 0 ? (
                      activeModules.map(mod => {
                        const Icon = mod.icon
                        return (
                          <div key={mod.key} style={{ ...s.iconCircle, backgroundColor: mod.bg, borderColor: mod.color + '40' }} title={mod.label}>
                            <Icon size={13} color={mod.color} strokeWidth={2} />
                          </div>
                        )
                      })
                    ) : (
                      <span style={s.noAccessLabel}>No access</span>
                    )}
                  </div>

                  <button style={s.expandBtn} onClick={e => { e.stopPropagation(); setExpanded(ex => ({ ...ex, [member.id]: !ex[member.id] })) }}>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div style={s.modulePanel}>
                    <div style={s.panelTopBar}>
                      <span style={s.panelLabel}>Module Access</span>
                      <button style={s.bulkBtn} onClick={() => toggleAll(member.id, !allAvailableOn)}>
                        {allAvailableOn ? 'Revoke All' : 'Grant All'}
                      </button>
                    </div>
                    <div style={s.moduleGrid}>
                      {MODULES.map((mod, i) => {
                        if (mod.section) {
                          return <div key={`section-${i}`} style={s.sectionLabel}>{mod.section}</div>
                        }
                        const active = perms[mod.key]
                        const isSaving = saving[`${member.id}_${mod.key}`]
                        const available = isModuleAvailable(mod)
                        const Icon = mod.icon

                        return (
                          <div key={mod.key} style={{ position: 'relative' }}>
                            <button
                              style={{
                                ...s.moduleBtn,
                                backgroundColor: !available ? '#f9fafb' : active ? mod.bg : '#f9fafb',
                                borderColor: !available ? '#e5e7eb' : active ? mod.color + '50' : '#e5e7eb',
                                opacity: isSaving ? 0.5 : 1,
                                cursor: available ? 'pointer' : 'default',
                              }}
                              onClick={() => available && togglePermission(member.id, mod.key)}
                              disabled={isSaving || !available}
                              title={!available ? 'This feature is not available in your current plan. Click here to view plans.' : active ? `Revoke ${mod.label} access` : `Grant ${mod.label} access`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                <Icon size={15} color={!available ? '#d1d5db' : active ? mod.color : '#9ca3af'} strokeWidth={1.8} />
                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: !available ? '#d1d5db' : active ? '#111827' : '#9ca3af' }}>
                                  {mod.label}
                                </span>
                              </div>
                              <div style={{
                                width: 22, height: 22, borderRadius: 6,
                                backgroundColor: !available ? '#e5e7eb' : active ? mod.color : '#e5e7eb',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.12s',
                              }}>
                                {active && available && <Check size={12} color="#fff" strokeWidth={3} />}
                              </div>
                            </button>
                            {/* Hash overlay for unavailable modules */}
                            {!available && (
                              <div
                                style={s.hashOverlay}
                                title="This feature is not available in your current plan. Click here to view plans."
                                onClick={() => navigate('/admin/billing')}
                              >
                                <Lock size={10} color="#9ca3af" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.5 },
  empty: { textAlign: 'center', padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  card: { backgroundColor: '#fff', borderRadius: 7, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', padding: '0.75rem 1.1rem', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' },
  memberInfo: { display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 },
  memberAvatar: { width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  memberName: { fontWeight: 600, color: '#111827', fontSize: '0.9rem' },
  memberRole: { color: '#9ca3af', fontSize: '0.72rem' },
  iconRow: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end', alignItems: 'center', marginRight: '0.25rem' },
  iconCircle: { width: 28, height: 28, borderRadius: '50%', border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noAccessLabel: { fontSize: '0.72rem', color: '#d1d5db', fontWeight: 500, fontStyle: 'italic' },
  expandBtn: { width: 30, height: 30, borderRadius: 6, border: '1.5px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', cursor: 'pointer', flexShrink: 0 },
  modulePanel: { borderTop: '1px solid #f3f4f6', backgroundColor: '#fafbfc' },
  panelTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1.1rem', borderBottom: '1px solid #f3f4f6' },
  panelLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' },
  bulkBtn: { padding: '0.3rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  moduleGrid: { padding: '0.75rem 1.1rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' },
  sectionLabel: { width: '100%', fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.2rem 0', marginTop: '0.15rem' },
  moduleBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 7, transition: 'all 0.12s', minWidth: 150, background: 'none' },
  hashOverlay: {
    position: 'absolute', inset: 0, borderRadius: 7, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(209,213,219,0.35) 3px, rgba(209,213,219,0.35) 5px)',
  },
}
