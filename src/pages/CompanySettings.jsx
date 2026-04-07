import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { COUNTRIES } from '../constants/countries'
import { Upload, Image, Plus, X, ChevronUp, ChevronDown, ShieldCheck, MessageSquare, Mail } from 'lucide-react'
import { applyTheme } from '../theme'
import { DEFAULT_STATUSES, parseStatuses } from '../utils/statuses'
import { useRole } from '../context/RoleContext'

export default function CompanySettings() {
  const { organizationId } = useRole()
  const [settings, setSettings] = useState({
    company_name: '',
    company_tagline: '',
    default_country: '',
    lock_country: false,
    currency: 'USD',
    primary_color: '#6366f1',
    secondary_color: '#8b5cf6',
    highlight_color: '#f59e0b',
    company_logo: '',
    company_logo_horizontal: '',
    signup_policy: 'closed',
    invoice_processing: 'manual',
    payment_terms: 'due_on_receipt',
    invoice_delay_days: '0',
    invoice_prefix: 'INV-',
    invoice_default_notes: '',
    mentee_statuses: JSON.stringify(DEFAULT_STATUSES),
    mentee_can_edit_status: false,
    mentee_bio_visible_to_others: false,
    mentor_pay_percentage_enabled: true,
    mentor_pay_monthly_enabled: true,
    mentor_pay_per_meeting_enabled: true,
    mentor_pay_hourly_enabled: true,
    reply_to_email: '',
    reply_to_name: '',
  })
  const [newStatusInput, setNewStatusInput] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [hLogoFile, setHLogoFile] = useState(null)
  const [hLogoPreview, setHLogoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const logoInputRef = useRef()
  const hLogoInputRef = useRef()
  const [staffList, setStaffList] = useState([])
  const [companyAdminIds, setCompanyAdminIds] = useState([]) // staff IDs designated as admins
  const [bugReportEmailOverride, setBugReportEmailOverride] = useState('')
  const [commMethods, setCommMethods] = useState(['Text', 'WhatsApp', 'Telegram', 'Signal'])
  const [newMethodInput, setNewMethodInput] = useState('')

  useEffect(() => {
    async function load() {
      const [settingsRes, staffRes] = await Promise.all([
        supabase.from('settings').select('key, value').eq('organization_id', organizationId),
        supabase.from('staff').select('id, first_name, last_name, email').order('last_name'),
      ])
      if (staffRes.data) setStaffList(staffRes.data)
      if (settingsRes.data) {
        const data = settingsRes.data
        const get = key => data.find(s => s.key === key)?.value || ''
        setSettings({
          company_name: get('company_name'),
          company_tagline: get('company_tagline'),
          default_country: get('default_country'),
          lock_country: get('lock_country') === 'true',
          currency: get('currency') || 'USD',
          primary_color: get('primary_color') || '#6366f1',
          secondary_color: get('secondary_color') || '#8b5cf6',
          highlight_color: get('highlight_color') || '#f59e0b',
          company_logo: get('company_logo'),
          company_logo_horizontal: get('company_logo_horizontal'),
          signup_policy: get('signup_policy') || 'closed',
          invoice_processing: get('invoice_processing') || 'manual',
          payment_terms: get('payment_terms') || 'due_on_receipt',
          invoice_delay_days: get('invoice_delay_days') || '0',
          invoice_prefix: get('invoice_prefix') || 'INV-',
          invoice_default_notes: get('invoice_default_notes') || '',
          mentee_statuses: get('mentee_statuses') || JSON.stringify(DEFAULT_STATUSES),
          mentee_can_edit_status: get('mentee_can_edit_status') === 'true',
          mentee_bio_visible_to_others: get('mentee_bio_visible_to_others') === 'true',
          mentor_pay_percentage_enabled: get('mentor_pay_percentage_enabled') !== 'false',
          mentor_pay_monthly_enabled: get('mentor_pay_monthly_enabled') !== 'false',
          mentor_pay_per_meeting_enabled: get('mentor_pay_per_meeting_enabled') !== 'false',
          mentor_pay_hourly_enabled: get('mentor_pay_hourly_enabled') !== 'false',
          reply_to_email: get('reply_to_email'),
          reply_to_name: get('reply_to_name'),
        })
        if (get('company_logo')) setLogoPreview(get('company_logo'))
        if (get('company_logo_horizontal')) setHLogoPreview(get('company_logo_horizontal'))
        // Load company admin IDs
        const adminIdsRaw = get('company_admin_ids')
        if (adminIdsRaw) {
          try { setCompanyAdminIds(JSON.parse(adminIdsRaw)) } catch { setCompanyAdminIds([]) }
        }
        setBugReportEmailOverride(get('bug_report_email_override'))
        const commRaw = get('communication_methods')
        if (commRaw) {
          try { const parsed = JSON.parse(commRaw); if (Array.isArray(parsed) && parsed.length) setCommMethods(parsed) } catch {}
        }
      }
    }
    load()
  }, [])

  function handleLogoFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function handleHLogoFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setHLogoFile(file)
    setHLogoPreview(URL.createObjectURL(file))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    let logoUrl = settings.company_logo
    let hLogoUrl = settings.company_logo_horizontal

    // Upload logo if selected
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `company/logo.${ext}`
      const { data: existing } = await supabase.storage.from('avatars').list('company', { search: 'logo.' })
      if (existing?.length) {
        const toRemove = existing.filter(f => f.name.startsWith('logo.')).map(f => `company/${f.name}`)
        if (toRemove.length) await supabase.storage.from('avatars').remove(toRemove)
      }
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, logoFile, { upsert: true })
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        logoUrl = `${publicUrl}?t=${Date.now()}`
      }
    }

    // Upload horizontal logo if selected
    if (hLogoFile) {
      const ext = hLogoFile.name.split('.').pop()
      const path = `company/logo-horizontal.${ext}`
      const { data: existing } = await supabase.storage.from('avatars').list('company', { search: 'logo-horizontal' })
      if (existing?.length) {
        const toRemove = existing.filter(f => f.name.startsWith('logo-horizontal')).map(f => `company/${f.name}`)
        if (toRemove.length) await supabase.storage.from('avatars').remove(toRemove)
      }
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, hLogoFile, { upsert: true })
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        hLogoUrl = `${publicUrl}?t=${Date.now()}`
      }
    }

    const upserts = [
      { key: 'company_name',     value: settings.company_name },
      { key: 'company_tagline',  value: settings.company_tagline },
      { key: 'default_country',  value: settings.default_country },
      { key: 'lock_country',     value: String(settings.lock_country) },
      { key: 'currency',         value: settings.currency },
      { key: 'primary_color',    value: settings.primary_color },
      { key: 'secondary_color',  value: settings.secondary_color },
      { key: 'highlight_color',  value: settings.highlight_color },
      { key: 'company_logo',              value: logoUrl },
      { key: 'company_logo_horizontal',  value: hLogoUrl },
      { key: 'signup_policy',             value: settings.signup_policy },
      { key: 'invoice_processing',       value: settings.invoice_processing },
      { key: 'payment_terms',             value: settings.payment_terms },
      { key: 'invoice_delay_days',        value: String(settings.invoice_delay_days) },
      { key: 'invoice_prefix',            value: settings.invoice_prefix },
      { key: 'invoice_default_notes',     value: settings.invoice_default_notes },
      { key: 'mentee_statuses',                 value: settings.mentee_statuses },
      { key: 'mentee_can_edit_status',          value: String(settings.mentee_can_edit_status) },
      { key: 'mentee_bio_visible_to_others',    value: String(settings.mentee_bio_visible_to_others) },
      { key: 'mentor_pay_percentage_enabled',   value: String(settings.mentor_pay_percentage_enabled) },
      { key: 'mentor_pay_monthly_enabled',      value: String(settings.mentor_pay_monthly_enabled) },
      { key: 'mentor_pay_per_meeting_enabled',  value: String(settings.mentor_pay_per_meeting_enabled) },
      { key: 'mentor_pay_hourly_enabled',       value: String(settings.mentor_pay_hourly_enabled) },
      { key: 'reply_to_email',                   value: settings.reply_to_email },
      { key: 'reply_to_name',                   value: settings.reply_to_name },
      { key: 'company_admin_ids',               value: JSON.stringify(companyAdminIds) },
      { key: 'bug_report_email_override',       value: bugReportEmailOverride },
      { key: 'communication_methods',           value: JSON.stringify(commMethods) },
    ].map(u => ({ ...u, organization_id: organizationId, updated_at: new Date().toISOString() }))

    const { error: upsertError } = await supabase.from('settings').upsert(upserts, { onConflict: 'organization_id,key' })

    if (upsertError) {
      setError(upsertError.message)
    } else {
      setSuccess('Settings saved successfully.')
      applyTheme({
        primary: settings.primary_color,
        secondary: settings.secondary_color,
        highlight: settings.highlight_color,
      })
    }

    setSaving(false)
  }

  function set(key, value) {
    setSettings(s => {
      const next = { ...s, [key]: value }
      // Live-preview color changes immediately
      if (key === 'primary_color' || key === 'secondary_color' || key === 'highlight_color') {
        applyTheme({
          primary: next.primary_color,
          secondary: next.secondary_color,
          highlight: next.highlight_color,
        })
      }
      return next
    })
  }

  const statusList = parseStatuses(settings.mentee_statuses)

  function updateStatuses(newList) {
    set('mentee_statuses', JSON.stringify(newList))
  }

  function addStatus() {
    const trimmed = newStatusInput.trim()
    if (!trimmed || statusList.includes(trimmed)) return
    updateStatuses([...statusList, trimmed])
    setNewStatusInput('')
  }

  function removeStatus(index) {
    updateStatuses(statusList.filter((_, i) => i !== index))
  }

  function moveStatus(index, direction) {
    const next = [...statusList]
    const swap = index + direction
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    updateStatuses(next)
  }

  function resetStatuses() {
    updateStatuses(DEFAULT_STATUSES)
  }

  function toggleCompanyAdmin(staffId) {
    setCompanyAdminIds(prev =>
      prev.includes(staffId)
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    )
  }

  return (
    <div>
      <div style={st.header}>
        <h1 style={st.title}>Company Settings</h1>
        <p style={st.sub}>Configure your organization's branding and defaults</p>
      </div>

      {success && <div style={st.successBox}>{success}</div>}
      {error && <div style={st.errorBox}>{error}</div>}

      <form onSubmit={handleSave} style={st.form}>

        {/* Organization */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Organization</h2>
          <div style={st.sectionBody}>

            <div style={st.settingRow}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Company Name</div>
                <div style={st.settingDesc}>Displayed in portals, emails, and the browser tab title.</div>
              </div>
              <input
                style={st.textInput}
                type="text"
                placeholder="e.g. MentorDesk"
                value={settings.company_name}
                onChange={e => set('company_name', e.target.value)}
              />
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Tagline</div>
                <div style={st.settingDesc}>A short phrase shown under your company name on login and portal pages.</div>
              </div>
              <input
                style={st.textInput}
                type="text"
                placeholder="e.g. Empowering mentors. Transforming lives."
                value={settings.company_tagline}
                onChange={e => set('company_tagline', e.target.value)}
              />
            </div>

          </div>
        </div>

        {/* Email Settings */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Email Settings</h2>
          <div style={st.sectionBody}>

            <div style={{ ...st.settingRow, alignItems: 'flex-start' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Reply-To Email Address</div>
                <div style={st.settingDesc}>
                  When your organization sends emails (welcome emails, invoices, etc.), replies from recipients will be directed to this address.
                  For example, if you set this to <strong>admin@coursecorrect.net</strong>, mentees who reply to any email from your org will reach that inbox.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flexShrink: 0, minWidth: 280 }}>
                <input
                  style={st.textInput}
                  type="email"
                  placeholder="e.g. admin@yourcompany.com"
                  value={settings.reply_to_email}
                  onChange={e => set('reply_to_email', e.target.value)}
                />
                {settings.reply_to_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#16a34a' }}>
                    <Mail size={12} />
                    <span>Replies will go to <strong>{settings.reply_to_email}</strong></span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Reply-To Display Name</div>
                <div style={st.settingDesc}>
                  The name shown alongside the reply-to address in email clients. If left blank, your company name will be used.
                </div>
              </div>
              <input
                style={st.textInput}
                type="text"
                placeholder={settings.company_name || 'e.g. CourseCorrect Support'}
                value={settings.reply_to_name}
                onChange={e => set('reply_to_name', e.target.value)}
              />
            </div>

          </div>
        </div>

        {/* Branding */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Branding</h2>
          <div style={st.sectionBody}>

            {/* Logo */}
            <div style={st.settingRow}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Company Logo</div>
                <div style={st.settingDesc}>Displayed in the admin portal header. Recommended size: 200×60px.</div>
              </div>
              <div style={st.logoArea}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={st.logoPreview} />
                ) : (
                  <div style={st.logoPlaceholder}>
                    <Image size={24} color="#d1d5db" strokeWidth={1.5} />
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No logo</span>
                  </div>
                )}
                <button type="button" style={st.uploadBtn} onClick={() => logoInputRef.current?.click()}>
                  <Upload size={13} strokeWidth={2} /> Upload Logo
                </button>
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoFile} />
              </div>
            </div>

            {/* Horizontal Logo */}
            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Horizontal Logo</div>
                <div style={st.settingDesc}>Wide format logo used in sidebar navigation across all portals. Recommended: transparent PNG, 200×40px.</div>
              </div>
              <div style={st.logoArea}>
                {hLogoPreview ? (
                  <img src={hLogoPreview} alt="Horizontal Logo" style={{ ...st.logoPreview, maxWidth: 220 }} />
                ) : (
                  <div style={{ ...st.logoPlaceholder, width: 180 }}>
                    <Image size={24} color="#d1d5db" strokeWidth={1.5} />
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No logo</span>
                  </div>
                )}
                <button type="button" style={st.uploadBtn} onClick={() => hLogoInputRef.current?.click()}>
                  <Upload size={13} strokeWidth={2} /> Upload
                </button>
                <input ref={hLogoInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleHLogoFile} />
              </div>
            </div>

            {/* Colors */}
            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Brand Colors</div>
                <div style={st.settingDesc}>Primary, secondary, and highlight colors used throughout the platform.</div>
              </div>
              <div style={st.colorGroup}>
                <ColorPicker label="Primary" value={settings.primary_color} onChange={v => set('primary_color', v)} />
                <ColorPicker label="Secondary" value={settings.secondary_color} onChange={v => set('secondary_color', v)} />
                <ColorPicker label="Highlight" value={settings.highlight_color} onChange={v => set('highlight_color', v)} />
              </div>
            </div>

          </div>
        </div>

        {/* Defaults */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Defaults</h2>
          <div style={st.sectionBody}>

            <div style={st.settingRow}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Currency</div>
                <div style={st.settingDesc}>Used for displaying pricing across offerings and invoicing.</div>
              </div>
              <select style={st.select} value={settings.currency} onChange={e => set('currency', e.target.value)}>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="CAD">CAD — Canadian Dollar (CA$)</option>
                <option value="GBP">GBP — British Pound (£)</option>
                <option value="EUR">EUR — Euro (€)</option>
                <option value="AUD">AUD — Australian Dollar (A$)</option>
                <option value="NZD">NZD — New Zealand Dollar (NZ$)</option>
                <option value="ZAR">ZAR — South African Rand (R)</option>
                <option value="NGN">NGN — Nigerian Naira (₦)</option>
                <option value="GHS">GHS — Ghanaian Cedi (₵)</option>
                <option value="KES">KES — Kenyan Shilling (KSh)</option>
                <option value="UGX">UGX — Ugandan Shilling (USh)</option>
              </select>
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Default Country</div>
                <div style={st.settingDesc}>Pre-fills the country field when adding a new mentor or mentee.</div>
              </div>
              <select style={st.select} value={settings.default_country} onChange={e => set('default_country', e.target.value)}>
                <option value="">— No default —</option>
                {COUNTRIES.map((c, i) =>
                  c.disabled
                    ? <option key={i} disabled>{c.label}</option>
                    : <option key={c.value} value={c.value}>{c.label}</option>
                )}
              </select>
            </div>

            {settings.default_country && (
              <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
                <div style={st.settingInfo}>
                  <div style={st.settingLabel}>Lock Country Field</div>
                  <div style={st.settingDesc}>
                    Locks the country field to <strong>{settings.default_country}</strong> on all add/edit forms.
                  </div>
                </div>
                <Toggle
                  checked={settings.lock_country}
                  onChange={v => set('lock_country', v)}
                  label={settings.lock_country ? 'Locked' : 'Unlocked'}
                />
              </div>
            )}

          </div>
        </div>

        {/* User Signups */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>User Signups</h2>
          <div style={st.sectionBody}>
            <div style={st.settingRow}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Signup Policy</div>
                <div style={st.settingDesc}>Control whether people outside your organization can create accounts on their own.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flexShrink: 0, minWidth: 280 }}>
                {[
                  { value: 'closed', label: 'Invite only', desc: 'Only admins can create accounts. External signups are not allowed.' },
                  { value: 'approval', label: 'Request access', desc: 'Anyone can request an account, but it must be approved by an admin before they can log in.' },
                  { value: 'open', label: 'Open signup', desc: 'Anyone can create an account and start using the platform immediately.' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', gap: '0.65rem', cursor: 'pointer', padding: '0.65rem 0.85rem', borderRadius: 6, border: `1.5px solid ${settings.signup_policy === opt.value ? '#6366f1' : '#e5e7eb'}`, backgroundColor: settings.signup_policy === opt.value ? '#eef2ff' : '#fff' }}>
                    <input
                      type="radio"
                      name="signup_policy"
                      value={opt.value}
                      checked={settings.signup_policy === opt.value}
                      onChange={e => set('signup_policy', e.target.value)}
                      style={{ marginTop: 3, accentColor: '#6366f1', flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Invoicing */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Invoicing</h2>
          <div style={st.sectionBody}>
            <div style={st.settingRow}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Invoice Processing</div>
                <div style={st.settingDesc}>Choose how invoices are sent and processed for your mentees.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flexShrink: 0, minWidth: 280 }}>
                {[
                  { value: 'auto', label: 'Auto-process', desc: 'Automatically process payment when an invoice is due.' },
                  { value: 'auto_send', label: 'Auto-send, manual process', desc: 'Automatically email invoice to the mentee, but process payment manually.' },
                  { value: 'manual', label: 'Fully manual', desc: 'Manually send invoices and manually process all payments.' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', gap: '0.65rem', cursor: 'pointer', padding: '0.65rem 0.85rem', borderRadius: 6, border: `1.5px solid ${settings.invoice_processing === opt.value ? '#6366f1' : '#e5e7eb'}`, backgroundColor: settings.invoice_processing === opt.value ? '#eef2ff' : '#fff' }}>
                    <input
                      type="radio"
                      name="invoice_processing"
                      value={opt.value}
                      checked={settings.invoice_processing === opt.value}
                      onChange={e => set('invoice_processing', e.target.value)}
                      style={{ marginTop: 3, accentColor: '#6366f1', flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Payment Terms</div>
                <div style={st.settingDesc}>How long mentees have to pay after an invoice is issued. "Due on receipt" means payment is expected immediately.</div>
              </div>
              <select style={st.select} value={settings.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="net_15">Net 15 (15 days)</option>
                <option value="net_30">Net 30 (30 days)</option>
                <option value="net_45">Net 45 (45 days)</option>
                <option value="net_60">Net 60 (60 days)</option>
              </select>
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Default Invoice Delay</div>
                <div style={st.settingDesc}>
                  Number of days to wait before issuing an invoice after an offering is assigned. Set to 0 to issue immediately on assignment.
                  This is the company-wide default — individual offerings can override this value.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <input
                  style={{ ...st.textInput, minWidth: 80, maxWidth: 100, textAlign: 'center' }}
                  type="number"
                  min="0"
                  max="365"
                  value={settings.invoice_delay_days}
                  onChange={e => set('invoice_delay_days', e.target.value)}
                />
                <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 500 }}>days</span>
              </div>
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Invoice Number Prefix</div>
                <div style={st.settingDesc}>
                  Prefix for auto-generated invoice numbers (e.g. "INV-" produces INV-000001, INV-000002, etc.).
                  Changing this only affects new invoices.
                </div>
              </div>
              <input
                style={{ ...st.textInput, minWidth: 120, maxWidth: 160 }}
                type="text"
                maxLength={20}
                value={settings.invoice_prefix}
                onChange={e => set('invoice_prefix', e.target.value)}
                placeholder="INV-"
              />
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Default Invoice Notes</div>
                <div style={st.settingDesc}>
                  Payment instructions or notes included on every new invoice by default.
                  Can be overridden per invoice.
                </div>
              </div>
              <textarea
                style={{ ...st.textInput, minWidth: 280, maxWidth: 340, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                value={settings.invoice_default_notes}
                onChange={e => set('invoice_default_notes', e.target.value)}
                placeholder="e.g. Please make checks payable to…"
              />
            </div>

          </div>
        </div>

        {/* Mentor Compensation */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Mentor Compensation</h2>
          <div style={st.sectionBody}>
            <div style={{ ...st.settingRow, alignItems: 'flex-start' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Allowed Payment Systems</div>
                <div style={st.settingDesc}>
                  Enable or disable the compensation models available when configuring individual mentor profiles.
                  Disabled types will not appear in the Pay Type dropdown on a mentor's edit page.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 300 }}>
                {[
                  {
                    key: 'mentor_pay_percentage_enabled',
                    label: 'Percentage of Subscription Revenue',
                    desc: 'Mentor earns a % of mentee subscription revenue, pro-rated by completed meetings.',
                  },
                  {
                    key: 'mentor_pay_monthly_enabled',
                    label: 'Flat Monthly Rate',
                    desc: 'Mentor receives a fixed dollar amount each month, regardless of meeting count.',
                  },
                  {
                    key: 'mentor_pay_per_meeting_enabled',
                    label: 'Per-Meeting Rate',
                    desc: 'Mentor is paid a flat dollar rate for each completed meeting.',
                  },
                  {
                    key: 'mentor_pay_hourly_enabled',
                    label: 'Hourly Rate',
                    desc: 'Mentor is paid per hour worked. Hours tracking is in development.',
                  },
                ].map(opt => (
                  <div key={opt.key} style={st.compensationRow}>
                    <div style={st.compensationInfo}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.1rem' }}>{opt.desc}</div>
                    </div>
                    <Toggle
                      checked={!!settings[opt.key]}
                      onChange={v => set(opt.key, v)}
                      label={settings[opt.key] ? 'Enabled' : 'Disabled'}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Communication Methods */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Communication Methods</h2>
          <div style={st.sectionBody}>
            <div style={{ ...st.settingRow, alignItems: 'flex-start' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Available Methods</div>
                <div style={st.settingDesc}>
                  Define the communication methods available across all user profiles (mentees, mentors, staff).
                  Each person can mark which methods they use and which one they prefer.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 300, flex: 1 }}>
                {commMethods.map((method, i) => (
                  <div key={i} style={st.statusItem}>
                    <span style={st.statusItemText}>{method}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button type="button" style={st.statusMoveBtn} onClick={() => {
                        if (i === 0) return
                        const next = [...commMethods]; [next[i], next[i - 1]] = [next[i - 1], next[i]]; setCommMethods(next)
                      }} disabled={i === 0} title="Move up"><ChevronUp size={12} /></button>
                      <button type="button" style={st.statusMoveBtn} onClick={() => {
                        if (i === commMethods.length - 1) return
                        const next = [...commMethods]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setCommMethods(next)
                      }} disabled={i === commMethods.length - 1} title="Move down"><ChevronDown size={12} /></button>
                      <button type="button" style={st.statusRemoveBtn} onClick={() => setCommMethods(commMethods.filter((_, j) => j !== i))} title="Remove"><X size={12} /></button>
                    </div>
                  </div>
                ))}
                <div style={st.addStatusRow}>
                  <input
                    style={{ ...st.select, flex: 1, padding: '0.5rem 0.75rem' }}
                    placeholder="New method name…"
                    value={newMethodInput}
                    onChange={e => setNewMethodInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const trimmed = newMethodInput.trim()
                        if (trimmed && !commMethods.includes(trimmed)) { setCommMethods([...commMethods, trimmed]); setNewMethodInput('') }
                      }
                    }}
                  />
                  <button type="button" style={st.addStatusBtn} onClick={() => {
                    const trimmed = newMethodInput.trim()
                    if (trimmed && !commMethods.includes(trimmed)) { setCommMethods([...commMethods, trimmed]); setNewMethodInput('') }
                  }} disabled={!newMethodInput.trim()}><Plus size={13} /> Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Administration */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Administration</h2>
          <div style={st.sectionBody}>

            <div style={{ ...st.settingRow, alignItems: 'flex-start' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Company Administrators</div>
                <div style={st.settingDesc}>
                  Designate one or more staff members as company administrators. Bug reports and system notifications will be routed to these administrators.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 300, flex: 1 }}>
                {staffList.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
                    No staff members found. Add staff members first.
                  </p>
                ) : (
                  staffList.map(staff => {
                    const isAdmin = companyAdminIds.includes(staff.id)
                    return (
                      <div key={staff.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.6rem 0.85rem', borderRadius: 6,
                        border: `1.5px solid ${isAdmin ? '#6366f1' : '#e5e7eb'}`,
                        backgroundColor: isAdmin ? '#eef2ff' : '#fff',
                        gap: '0.75rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                          {isAdmin && <ShieldCheck size={16} color="#6366f1" style={{ flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                              {staff.first_name} {staff.last_name}
                            </div>
                            {staff.email && (
                              <div style={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {staff.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <Toggle
                          checked={isAdmin}
                          onChange={() => toggleCompanyAdmin(staff.id)}
                          label={isAdmin ? 'Admin' : 'Not admin'}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Bug Report Email Override</div>
                <div style={st.settingDesc}>
                  Optionally send bug reports to a specific email address instead of the company administrators. Leave blank to send to the designated admins above.
                </div>
              </div>
              <input
                style={st.textInput}
                type="email"
                placeholder="e.g. support@yourcompany.com"
                value={bugReportEmailOverride}
                onChange={e => setBugReportEmailOverride(e.target.value)}
              />
            </div>

          </div>
        </div>

        {/* Status Workflow */}
        <div style={st.section}>
          <h2 style={st.sectionTitle}>Mentee Status Workflow</h2>
          <div style={st.sectionBody}>
            <div style={st.settingRow}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Allow Mentees to Update Their Status</div>
                <div style={st.settingDesc}>
                  When enabled, mentees can change their own status from their portal. When disabled, only mentors and staff can update a mentee's status.
                </div>
              </div>
              <Toggle
                checked={settings.mentee_can_edit_status}
                onChange={v => set('mentee_can_edit_status', v)}
                label={settings.mentee_can_edit_status ? 'Allowed' : 'Disabled'}
              />
            </div>
            <div style={{ ...st.settingRow, borderTop: '1px solid #f3f4f6' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Mentee Bio Visibility</div>
                <div style={st.settingDesc}>
                  When enabled, mentee bios are visible to mentors and other mentees. When disabled, bios are only visible to staff and administrators.
                </div>
              </div>
              <Toggle
                checked={settings.mentee_bio_visible_to_others}
                onChange={v => set('mentee_bio_visible_to_others', v)}
                label={settings.mentee_bio_visible_to_others ? 'Visible to all' : 'Staff only'}
              />
            </div>
            <div style={{ ...st.settingRow, alignItems: 'flex-start' }}>
              <div style={st.settingInfo}>
                <div style={st.settingLabel}>Status Stages</div>
                <div style={st.settingDesc}>
                  Customize the stages a mentee moves through. Drag reorder using the up/down arrows. These statuses appear in all mentee dropdowns.
                </div>
                <button
                  type="button"
                  style={st.resetBtn}
                  onClick={resetStatuses}
                >
                  Reset to defaults
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 300, flex: 1 }}>
                {statusList.map((status, i) => (
                  <div key={i} style={st.statusItem}>
                    <span style={st.statusItemText}>{status}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        style={st.statusMoveBtn}
                        onClick={() => moveStatus(i, -1)}
                        disabled={i === 0}
                        title="Move up"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        style={st.statusMoveBtn}
                        onClick={() => moveStatus(i, 1)}
                        disabled={i === statusList.length - 1}
                        title="Move down"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        type="button"
                        style={st.statusRemoveBtn}
                        onClick={() => removeStatus(i)}
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                <div style={st.addStatusRow}>
                  <input
                    style={{ ...st.select, flex: 1, padding: '0.5rem 0.75rem' }}
                    placeholder="New status name…"
                    value={newStatusInput}
                    onChange={e => setNewStatusInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStatus())}
                  />
                  <button
                    type="button"
                    style={st.addStatusBtn}
                    onClick={addStatus}
                    disabled={!newStatusInput.trim()}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={st.actions}>
          <button type="submit" style={st.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ColorPicker({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ position: 'relative', width: 44, height: 44 }}>
        <div style={{ width: 44, height: 44, borderRadius: 6, background: value, border: '2px solid #e5e7eb', overflow: 'hidden' }}>
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{ width: '200%', height: '200%', border: 'none', padding: 0, cursor: 'pointer', transform: 'translate(-25%, -25%)' }}
          />
        </div>
      </div>
      <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
      <div style={{ width: 44, height: 24, borderRadius: 49, backgroundColor: checked ? '#6366f1' : '#e5e7eb', position: 'relative', transition: 'background 0.15s' }}>
        <div style={{ position: 'absolute', top: 2, width: 20, height: 20, backgroundColor: '#fff', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.15s', transform: checked ? 'translateX(22px)' : 'translateX(2px)' }} />
      </div>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>{label}</span>
    </label>
  )
}

const st = {
  header: { marginBottom: '2rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  section: { backgroundColor: '#fff', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' },
  sectionTitle: { margin: 0, padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#374151', backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase', letterSpacing: '0.06em' },
  sectionBody: { padding: '0.25rem 0' },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.5rem', gap: '1.5rem', flexWrap: 'wrap' },
  settingInfo: { flex: 1, minWidth: 200 },
  settingLabel: { fontWeight: 600, color: '#111827', marginBottom: '0.2rem', fontSize: '0.9rem' },
  settingDesc: { fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.5 },
  logoArea: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', flexShrink: 0 },
  logoPreview: { height: 52, maxWidth: 160, objectFit: 'contain', borderRadius: 6, border: '1px solid #e5e7eb', padding: '0.25rem 0.5rem', backgroundColor: '#f9fafb' },
  logoPlaceholder: { width: 120, height: 52, borderRadius: 6, border: '1.5px dashed #d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', backgroundColor: '#f9fafb' },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: '0.78rem', fontWeight: 600, color: '#374151' },
  colorGroup: { display: 'flex', gap: '1.5rem', flexShrink: 0 },
  select: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', minWidth: 200, backgroundColor: '#fff', color: '#374151' },
  actions: { display: 'flex', justifyContent: 'flex-end' },
  saveBtn: { padding: '0.65rem 1.5rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' },
  successBox: { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.75rem 1rem', color: '#15803d', marginBottom: '1rem', fontSize: '0.875rem' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' },
  statusItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, gap: '0.5rem' },
  statusItemText: { fontSize: '0.875rem', color: '#374151', fontWeight: 500, flex: 1 },
  statusMoveBtn: { width: 24, height: 24, borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', cursor: 'pointer', padding: 0 },
  statusRemoveBtn: { width: 24, height: 24, borderRadius: 4, border: '1px solid #fecaca', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', cursor: 'pointer', padding: 0 },
  addStatusRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' },
  addStatusBtn: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 0.9rem', background: 'var(--primary-gradient)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600, flexShrink: 0, cursor: 'pointer' },
  resetBtn: { marginTop: '0.75rem', padding: '0.3rem 0.7rem', background: 'none', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer', fontWeight: 500 },
  textInput: { padding: '0.6rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 4, fontSize: '0.875rem', minWidth: 280, backgroundColor: '#fff', color: '#374151', flexShrink: 0 },
  compensationRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', padding: '0.65rem 0.85rem', backgroundColor: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' },
  compensationInfo: { flex: 1 },
}
