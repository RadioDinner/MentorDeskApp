import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { BarChart3, Users, Calendar, TrendingUp, Building2, BookOpen, DollarSign, Activity } from 'lucide-react'

// ─── SVG Chart Components ────────────────────────────────────

function BarChartHorizontal({ data, maxValue, color = '#6366f1', height = 28 }) {
  if (!data || data.length === 0) return null
  const max = maxValue || Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ width: 120, fontSize: '0.78rem', fontWeight: 600, color: '#374151', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}
          </span>
          <div style={{ flex: 1, height, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${Math.max(2, (item.value / max) * 100)}%`,
              height: '100%', borderRadius: 6,
              background: item.color || color,
              transition: 'width 0.5s ease',
            }} />
            <span style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              fontSize: '0.72rem', fontWeight: 700, color: (item.value / max) > 0.5 ? '#fff' : '#374151',
              ...(item.value / max > 0.5 ? { right: 'auto', left: 8 } : {}),
            }}>
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ data, width = 180, height = 40, color = '#6366f1', fillOpacity = 0.15 }) {
  if (!data || data.length < 2) return <div style={{ width, height, background: '#f8fafc', borderRadius: 4 }} />
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={areaPath} fill={color} opacity={fillOpacity} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3} fill={color} />
    </svg>
  )
}

function DonutChart({ value, max, size = 80, strokeWidth = 8, color = '#6366f1', label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ textAlign: 'center', marginTop: -size / 2 - 10, marginBottom: size / 2 - 18 }}>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{Math.round(pct)}%</div>
      </div>
      {label && <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginTop: 2 }}>{label}</div>}
    </div>
  )
}

function MiniBarChart({ data, width = 180, height = 50, color = '#6366f1', barRadius = 2 }) {
  if (!data || data.length === 0) return <div style={{ width, height, background: '#f8fafc', borderRadius: 4 }} />
  const max = Math.max(...data.map(d => d.value), 1)
  const gap = 2
  const barWidth = Math.max(4, (width - gap * (data.length - 1)) / data.length)

  return (
    <svg width={width} height={height + 16} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / max) * height)
        const x = i * (barWidth + gap)
        return (
          <g key={i}>
            <rect
              x={x} y={height - barH} width={barWidth} height={barH}
              fill={d.highlight ? color : color + '60'}
              rx={barRadius}
            />
            {d.label && (
              <text x={x + barWidth / 2} y={height + 12} textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="600">
                {d.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ActivityGrid({ data, weeks = 12, color = '#6366f1' }) {
  // data is an array of { date: 'YYYY-MM-DD', count: N }
  const max = Math.max(...(data || []).map(d => d.count), 1)
  const cellSize = 12
  const gap = 2
  const days = 7

  // Build grid: weeks x 7 days
  const today = new Date()
  const grid = []
  for (let w = weeks - 1; w >= 0; w--) {
    const week = []
    for (let d = 0; d < days; d++) {
      const date = new Date(today)
      date.setDate(date.getDate() - (w * 7 + (6 - d)))
      const dateStr = date.toISOString().split('T')[0]
      const entry = (data || []).find(e => e.date === dateStr)
      week.push({ date: dateStr, count: entry ? entry.count : 0 })
    }
    grid.push(week)
  }

  return (
    <div style={{ display: 'flex', gap, overflow: 'hidden' }}>
      {grid.map((week, wi) => (
        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
          {week.map((day, di) => {
            const intensity = day.count > 0 ? Math.max(0.15, day.count / max) : 0
            return (
              <div
                key={di}
                title={`${day.date}: ${day.count} events`}
                style={{
                  width: cellSize, height: cellSize, borderRadius: 2,
                  background: day.count > 0 ? color : '#f1f5f9',
                  opacity: day.count > 0 ? intensity * 0.85 + 0.15 : 1,
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function SuperAdminUsage() {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [loginData, setLoginData] = useState({ daily: [], byOrg: [], grid: [], total: 0 })
  const [meetingData, setMeetingData] = useState({ byOrg: [], statusBreakdown: {}, total: 0, completed: 0 })
  const [enrollmentData, setEnrollmentData] = useState({ byOrg: [], monthly: [], total: 0 })
  const [revenueData, setRevenueData] = useState({ byOrg: [], total: 0, paid: 0, pending: 0 })
  const [lessonData, setLessonData] = useState({ total: 0, completed: 0 })
  const [topOrgs, setTopOrgs] = useState([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    // Fetch organizations first
    const { data: orgList } = await supabase.from('organizations').select('id, name, slug, plan, active')
    const orgMap = {}
    ;(orgList || []).forEach(o => { orgMap[o.id] = o })
    setOrgs(orgList || [])

    await Promise.all([
      loadLoginStats(orgMap),
      loadMeetingStats(orgMap),
      loadEnrollmentStats(orgMap),
      loadRevenueStats(orgMap),
      loadLessonStats(),
      loadTopOrgs(orgMap),
    ])

    setLoading(false)
  }

  async function loadLoginStats(orgMap) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90)

    const { data: logins } = await supabase
      .from('login_events')
      .select('id, timestamp, organization_id')
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('timestamp', { ascending: true })

    if (!logins) return

    // Daily login counts (last 30 days)
    const dailyMap = {}
    const orgLoginMap = {}
    const gridMap = {}

    logins.forEach(l => {
      const day = l.timestamp ? l.timestamp.split('T')[0] : null
      if (day) {
        dailyMap[day] = (dailyMap[day] || 0) + 1
        gridMap[day] = (gridMap[day] || 0) + 1
      }
      if (l.organization_id) {
        orgLoginMap[l.organization_id] = (orgLoginMap[l.organization_id] || 0) + 1
      }
    })

    // Last 30 days sparkline
    const daily = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      daily.push(dailyMap[key] || 0)
    }

    // By org
    const byOrg = Object.entries(orgLoginMap)
      .map(([orgId, count]) => ({
        label: orgMap[orgId]?.name || 'Unknown',
        value: count,
        orgId,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // Grid data
    const grid = Object.entries(gridMap).map(([date, count]) => ({ date, count }))

    setLoginData({ daily, byOrg, grid, total: logins.length })
  }

  async function loadMeetingStats(orgMap) {
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, scheduled_at, status, organization_id')

    if (!meetings) return

    const orgMeetingMap = {}
    const statusMap = {}

    meetings.forEach(m => {
      if (m.organization_id) {
        orgMeetingMap[m.organization_id] = (orgMeetingMap[m.organization_id] || 0) + 1
      }
      const st = m.status || 'scheduled'
      statusMap[st] = (statusMap[st] || 0) + 1
    })

    const byOrg = Object.entries(orgMeetingMap)
      .map(([orgId, count]) => ({
        label: orgMap[orgId]?.name || 'Unknown',
        value: count,
        orgId,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    setMeetingData({
      byOrg,
      statusBreakdown: statusMap,
      total: meetings.length,
      completed: statusMap.completed || 0,
    })
  }

  async function loadEnrollmentStats(orgMap) {
    const { data: enrollments } = await supabase
      .from('mentee_offerings')
      .select('id, assigned_date, organization_id')
      .order('assigned_date', { ascending: true })

    if (!enrollments) return

    const orgEnrollMap = {}
    const monthlyMap = {}

    enrollments.forEach(e => {
      if (e.organization_id) {
        orgEnrollMap[e.organization_id] = (orgEnrollMap[e.organization_id] || 0) + 1
      }
      if (e.assigned_date) {
        const month = e.assigned_date.slice(0, 7) // YYYY-MM
        monthlyMap[month] = (monthlyMap[month] || 0) + 1
      }
    })

    const byOrg = Object.entries(orgEnrollMap)
      .map(([orgId, count]) => ({
        label: orgMap[orgId]?.name || 'Unknown',
        value: count,
        orgId,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // Last 6 months for bar chart
    const monthly = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const shortLabel = d.toLocaleString('default', { month: 'short' })
      monthly.push({ label: shortLabel, value: monthlyMap[key] || 0, highlight: i === 0 })
    }

    setEnrollmentData({ byOrg, monthly, total: enrollments.length })
  }

  async function loadRevenueStats(orgMap) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, amount, status, organization_id')

    if (!invoices) return

    const orgRevMap = {}
    let totalAmt = 0
    let paidAmt = 0
    let pendingAmt = 0

    invoices.forEach(inv => {
      const amt = Number(inv.amount) || 0
      totalAmt += amt
      if (inv.status === 'paid') paidAmt += amt
      if (inv.status === 'pending' || inv.status === 'overdue') pendingAmt += amt
      if (inv.organization_id) {
        orgRevMap[inv.organization_id] = (orgRevMap[inv.organization_id] || 0) + amt
      }
    })

    const byOrg = Object.entries(orgRevMap)
      .map(([orgId, amount]) => ({
        label: orgMap[orgId]?.name || 'Unknown',
        value: Math.round(amount * 100) / 100,
        orgId,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    setRevenueData({ byOrg, total: totalAmt, paid: paidAmt, pending: pendingAmt })
  }

  async function loadLessonStats() {
    const { data: progress } = await supabase
      .from('mentee_lesson_progress')
      .select('id, completed_at')

    if (!progress) return
    setLessonData({
      total: progress.length,
      completed: progress.filter(p => p.completed_at).length,
    })
  }

  async function loadTopOrgs(orgMap) {
    // Composite score: logins + meetings + enrollments
    const { data: roles } = await supabase
      .from('user_roles')
      .select('organization_id')

    const orgActivity = {}
    ;(roles || []).forEach(r => {
      if (r.organization_id) {
        orgActivity[r.organization_id] = (orgActivity[r.organization_id] || 0) + 1
      }
    })

    const top = Object.entries(orgActivity)
      .map(([orgId, score]) => ({
        orgId,
        name: orgMap[orgId]?.name || 'Unknown',
        slug: orgMap[orgId]?.slug || '',
        plan: orgMap[orgId]?.plan || 'free',
        status: orgMap[orgId]?.status || (orgMap[orgId]?.active ? 'active' : 'archived'),
        score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    setTopOrgs(top)
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading analytics...</div>

  const meetingCompletionRate = meetingData.total > 0 ? meetingData.completed : 0
  const lessonCompletionRate = lessonData.total > 0 ? lessonData.completed : 0

  return (
    <div>
      <div style={s.header}>
        <div style={s.headerIcon}>
          <BarChart3 size={24} color="#fff" />
        </div>
        <div>
          <h1 style={s.title}>Usage Analytics</h1>
          <p style={s.sub}>Platform-wide usage statistics and organization engagement</p>
        </div>
      </div>

      {/* Top KPIs */}
      <div style={s.kpiRow}>
        <KpiCard icon={Users} label="Total Logins (90d)" value={loginData.total} color="#6366f1"
          detail={<Sparkline data={loginData.daily} color="#6366f1" width={140} height={32} />}
        />
        <KpiCard icon={Calendar} label="Total Meetings" value={meetingData.total} color="#3b82f6"
          detail={<span style={{ fontSize: '0.75rem', color: '#64748b' }}>{meetingData.completed} completed</span>}
        />
        <KpiCard icon={BookOpen} label="Enrollments" value={enrollmentData.total} color="#16a34a"
          detail={<MiniBarChart data={enrollmentData.monthly} color="#16a34a" width={140} height={32} />}
        />
        <KpiCard icon={DollarSign} label="Total Revenue" value={`$${Math.round(revenueData.total).toLocaleString()}`} color="#f59e0b"
          detail={<span style={{ fontSize: '0.75rem', color: '#64748b' }}>${Math.round(revenueData.pending).toLocaleString()} pending</span>}
        />
      </div>

      {/* Row: Login Activity + Completion Rates */}
      <div style={s.twoCol}>
        <div style={{ ...s.card, flex: '2 1 400px' }}>
          <h3 style={s.cardTitle}>
            <Activity size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Login Activity (Last 90 Days)
          </h3>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>Daily Logins (Last 30 Days)</div>
            <Sparkline data={loginData.daily} color="#6366f1" width={500} height={60} fillOpacity={0.1} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>Activity Heatmap (12 Weeks)</div>
            <ActivityGrid data={loginData.grid} weeks={12} color="#6366f1" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map((opacity, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: i === 0 ? '#f1f5f9' : '#6366f1', opacity: i === 0 ? 1 : opacity * 0.85 + 0.15 }} />
              ))}
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>More</span>
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Completion Rates</h3>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '0.5rem 0' }}>
              <DonutChart value={meetingCompletionRate} max={meetingData.total || 1} color="#3b82f6" label="Meetings" />
              <DonutChart value={lessonCompletionRate} max={lessonData.total || 1} color="#16a34a" label="Lessons" />
            </div>
          </div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Meeting Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(meetingData.statusBreakdown).map(([status, count]) => {
                const colors = { completed: '#16a34a', scheduled: '#3b82f6', cancelled: '#dc2626' }
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[status] || '#94a3b8' }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{status}</span>
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{count}</span>
                  </div>
                )
              })}
              {Object.keys(meetingData.statusBreakdown).length === 0 && (
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No meetings yet</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row: Logins by Org + Meetings by Org */}
      <div style={s.twoCol}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Users size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Logins by Organization
          </h3>
          {loginData.byOrg.length > 0 ? (
            <BarChartHorizontal data={loginData.byOrg} color="#6366f1" />
          ) : (
            <EmptyState text="No login data yet" />
          )}
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Calendar size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Meetings by Organization
          </h3>
          {meetingData.byOrg.length > 0 ? (
            <BarChartHorizontal data={meetingData.byOrg} color="#3b82f6" />
          ) : (
            <EmptyState text="No meeting data yet" />
          )}
        </div>
      </div>

      {/* Row: Enrollments + Revenue */}
      <div style={s.twoCol}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <BookOpen size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Enrollments by Organization
          </h3>
          {enrollmentData.byOrg.length > 0 ? (
            <BarChartHorizontal data={enrollmentData.byOrg} color="#16a34a" />
          ) : (
            <EmptyState text="No enrollment data yet" />
          )}
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <DollarSign size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            Revenue by Organization
          </h3>
          {revenueData.byOrg.length > 0 ? (
            <BarChartHorizontal
              data={revenueData.byOrg.map(d => ({ ...d, label: d.label, value: d.value }))}
              color="#f59e0b"
            />
          ) : (
            <EmptyState text="No invoice data yet" />
          )}
          {revenueData.total > 0 && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
              <RevenueChip label="Paid" value={revenueData.paid} color="#16a34a" />
              <RevenueChip label="Pending" value={revenueData.pending} color="#f59e0b" />
              <RevenueChip label="Total" value={revenueData.total} color="#0f172a" />
            </div>
          )}
        </div>
      </div>

      {/* Top Engaged Organizations */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>
          <TrendingUp size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Most Active Organizations
        </h3>
        {topOrgs.length > 0 ? (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {topOrgs.map((org, i) => (
              <Link key={org.orgId} to={`/organizations/${org.orgId}`} style={{ textDecoration: 'none', flex: '1 1 180px', maxWidth: 240 }}>
                <div style={s.topOrgCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ ...s.rank, background: i === 0 ? '#fef3c7' : i === 1 ? '#f1f5f9' : i === 2 ? '#fef2f2' : '#f8fafc', color: i === 0 ? '#d97706' : i === 1 ? '#64748b' : i === 2 ? '#dc2626' : '#94a3b8' }}>
                      #{i + 1}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>{org.slug}</span>
                    <span style={{
                      padding: '0.12rem 0.4rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600,
                      textTransform: 'capitalize',
                      background: org.plan === 'pro' ? '#ede9fe' : org.plan === 'enterprise' ? '#fef3c7' : org.plan === 'starter' ? '#eff6ff' : '#f1f5f9',
                      color: org.plan === 'pro' ? '#7c3aed' : org.plan === 'enterprise' ? '#d97706' : org.plan === 'starter' ? '#3b82f6' : '#64748b',
                    }}>
                      {org.plan}
                    </span>
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: '#6366f1' }}>
                    {org.score} user roles
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState text="No organization data yet" />
        )}
      </div>

      {/* Enrollment Trend */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>
          <TrendingUp size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Monthly Enrollment Trend
        </h3>
        <MiniBarChart data={enrollmentData.monthly} color="#16a34a" width={500} height={80} barRadius={4} />
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, color, detail }) {
  return (
    <div style={s.kpiCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ ...s.kpiIcon, background: color + '14', color }}>
          <Icon size={18} />
        </div>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>{label}</div>
      {detail && <div style={{ marginTop: '0.25rem' }}>{detail}</div>}
    </div>
  )
}

function RevenueChip({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: '1rem', fontWeight: 800, color }}>${Math.round(value).toLocaleString()}</span>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
      {text}
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' },
  headerIcon: {
    width: 52, height: 52, borderRadius: 8,
    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
  },
  title: { fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.15rem' },
  sub: { color: '#64748b', fontSize: '0.9rem' },
  kpiRow: { display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  kpiCard: {
    flex: '1 1 200px', padding: '1.1rem 1.25rem', background: '#fff',
    borderRadius: 10, border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  kpiIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  twoCol: { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  card: {
    flex: '1 1 300px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
    padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    marginBottom: '0.5rem',
  },
  cardTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' },
  topOrgCard: {
    background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
    padding: '1rem 1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'box-shadow 0.15s, border-color 0.15s',
  },
  rank: {
    width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.72rem', fontWeight: 800, flexShrink: 0,
  },
}
