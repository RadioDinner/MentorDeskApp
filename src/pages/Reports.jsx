import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useRole } from '../context/RoleContext'
import { BarChart3, Users, TrendingUp, Calendar, BookOpen, Percent, Hash, Filter, RotateCcw } from 'lucide-react'
import { parseStatuses, getStatusColor } from '../utils/statuses'

export default function Reports() {
  const { organizationId } = useRole()
  const [mentees, setMentees] = useState([])
  const [loading, setLoading] = useState(true)

  // Course completion report state
  const [courseOfferings, setCourseOfferings] = useState([])
  const [selectedOfferingId, setSelectedOfferingId] = useState('')
  const [displayMode, setDisplayMode] = useState('percentage') // 'percentage' | 'count'
  const [completionData, setCompletionData] = useState(null)
  const [completionLoading, setCompletionLoading] = useState(false)

  // Funnel report state
  const [allStatuses, setAllStatuses] = useState([])
  const [allOfferings, setAllOfferings] = useState([])
  const [offeringEnrollments, setOfferingEnrollments] = useState({}) // { offering_id: count }
  const [funnelExcludedStatuses, setFunnelExcludedStatuses] = useState([])
  const [funnelExcludedOfferings, setFunnelExcludedOfferings] = useState([])
  const [funnelConfigLoaded, setFunnelConfigLoaded] = useState(false)
  const funnelSaveTimer = useRef(null)

  useEffect(() => {
    async function load() {
      const [menteesRes, offeringsRes, settingsRes, enrollmentsRes] = await Promise.all([
        supabase
          .from('mentees')
          .select('id, first_name, last_name, status, signup_date, created_at')
          .order('signup_date', { ascending: false }),
        supabase
          .from('offerings')
          .select('id, name, offering_type')
          .order('name'),
        supabase
          .from('settings')
          .select('key, value')
          .eq('organization_id', organizationId),
        supabase
          .from('mentee_offerings')
          .select('offering_id'),
      ])
      const menteeData = menteesRes.data || []
      const offeringData = offeringsRes.data || []
      setMentees(menteeData)
      setCourseOfferings(offeringData)
      setAllOfferings(offeringData)

      // Parse statuses from settings
      const settingsData = settingsRes.data || []
      const statusSetting = settingsData.find(s => s.key === 'mentee_statuses')?.value
      setAllStatuses(parseStatuses(statusSetting))

      // Count enrollments per offering
      const enrollCounts = {}
      ;(enrollmentsRes.data || []).forEach(e => {
        enrollCounts[e.offering_id] = (enrollCounts[e.offering_id] || 0) + 1
      })
      setOfferingEnrollments(enrollCounts)

      // Load funnel config from settings
      const funnelConfig = settingsData.find(s => s.key === 'funnel_report_config')?.value
      if (funnelConfig) {
        try {
          const parsed = JSON.parse(funnelConfig)
          setFunnelExcludedStatuses(parsed.excluded_statuses || [])
          setFunnelExcludedOfferings(parsed.excluded_offerings || [])
        } catch { /* use defaults */ }
      }
      setFunnelConfigLoaded(true)

      setLoading(false)
    }
    load()
  }, [organizationId])

  // Auto-save funnel config on change (debounced)
  const saveFunnelConfig = useCallback((excludedStatuses, excludedOfferings) => {
    if (!organizationId) return
    if (funnelSaveTimer.current) clearTimeout(funnelSaveTimer.current)
    funnelSaveTimer.current = setTimeout(() => {
      const value = JSON.stringify({ excluded_statuses: excludedStatuses, excluded_offerings: excludedOfferings })
      supabase.from('settings').upsert(
        { organization_id: organizationId, key: 'funnel_report_config', value },
        { onConflict: 'organization_id,key' }
      )
    }, 800)
  }, [organizationId])

  function toggleFunnelStatus(status) {
    setFunnelExcludedStatuses(prev => {
      const next = prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
      saveFunnelConfig(next, funnelExcludedOfferings)
      return next
    })
  }

  function toggleFunnelOffering(offeringId) {
    setFunnelExcludedOfferings(prev => {
      const next = prev.includes(offeringId) ? prev.filter(id => id !== offeringId) : [...prev, offeringId]
      saveFunnelConfig(funnelExcludedStatuses, next)
      return next
    })
  }

  function resetFunnelConfig() {
    setFunnelExcludedStatuses([])
    setFunnelExcludedOfferings([])
    saveFunnelConfig([], [])
  }

  useEffect(() => {
    if (selectedOfferingId) loadCourseCompletion(selectedOfferingId)
    else setCompletionData(null)
  }, [selectedOfferingId])

  async function loadCourseCompletion(offeringId) {
    setCompletionLoading(true)
    setCompletionData(null)

    // 1. Get the course record for this offering
    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('offering_id', offeringId)
      .single()

    if (!course) {
      setCompletionData({ totalLessons: 0, rows: [] })
      setCompletionLoading(false)
      return
    }

    // 2. Fetch lessons for this course and enrolled mentees in parallel
    const [lessonsRes, enrollmentsRes] = await Promise.all([
      supabase
        .from('lessons')
        .select('id, title, order_index')
        .eq('course_id', course.id)
        .order('order_index'),
      supabase
        .from('mentee_offerings')
        .select('mentee_id, mentee:mentees(id, first_name, last_name, email, status)')
        .eq('offering_id', offeringId),
    ])

    const lessons = lessonsRes.data || []
    const enrollments = (enrollmentsRes.data || []).filter(e => e.mentee)
    const totalLessons = lessons.length

    if (enrollments.length === 0 || totalLessons === 0) {
      setCompletionData({ totalLessons, rows: enrollments.map(e => ({ mentee: e.mentee, completed: 0, total: totalLessons })) })
      setCompletionLoading(false)
      return
    }

    // 3. Fetch progress for all enrolled mentees for lessons in this course
    const menteeIds = enrollments.map(e => e.mentee_id)
    const lessonIds = lessons.map(l => l.id)

    const { data: progressData } = await supabase
      .from('mentee_lesson_progress')
      .select('mentee_id, lesson_id, completed_at')
      .in('mentee_id', menteeIds)
      .in('lesson_id', lessonIds)

    // 4. Count completed lessons per mentee
    const completedByMentee = {}
    ;(progressData || []).forEach(p => {
      if (p.completed_at) {
        completedByMentee[p.mentee_id] = (completedByMentee[p.mentee_id] || 0) + 1
      }
    })

    const rows = enrollments
      .map(e => ({
        mentee: e.mentee,
        completed: completedByMentee[e.mentee_id] || 0,
        total: totalLessons,
      }))
      .sort((a, b) => {
        const aName = `${a.mentee.last_name} ${a.mentee.first_name}`.toLowerCase()
        const bName = `${b.mentee.last_name} ${b.mentee.first_name}`.toLowerCase()
        return aName.localeCompare(bName)
      })

    setCompletionData({ totalLessons, rows })
    setCompletionLoading(false)
  }

  // Group by year-month
  const byMonth = {}
  mentees.forEach(m => {
    const date = m.signup_date || m.created_at?.split('T')[0]
    if (!date) return
    const key = date.slice(0, 7) // YYYY-MM
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(m)
  })
  const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))
  const maxCount = Math.max(...Object.values(byMonth).map(a => a.length), 1)

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  function fmtMonth(key) {
    const [yr, mo] = key.split('-')
    return `${MONTH_NAMES[parseInt(mo) - 1]} ${yr}`
  }

  const STATUS_COLORS = {
    'Lead':                     '#c026d3',
    'Deciding':                 '#ea580c',
    'Discovery Call Scheduled': '#0d9488',
    'Waiting List':             '#64748b',
    'JumpStart Your Freedom':   '#3b82f6',
    '4x Mentoring':             '#d97706',
    '2x Mentoring':             '#d97706',
    '1x Mentoring':             '#16a34a',
    'Graduate':                 '#7c3aed',
  }

  // Status breakdown
  const statusCounts = {}
  mentees.forEach(m => {
    statusCounts[m.status || 'Unknown'] = (statusCounts[m.status || 'Unknown'] || 0) + 1
  })

  // Last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recent = mentees.filter(m => {
    const d = m.signup_date || m.created_at?.split('T')[0]
    return d && new Date(d) >= thirtyDaysAgo
  })

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.title}>Reports</h1>
        <p style={s.sub}>Analytics &amp; program insights</p>
      </div>

      {/* Summary cards */}
      <div style={s.statsRow}>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: '#eef2ff' }}>
            <Users size={18} color="#6366f1" />
          </div>
          <div style={s.statValue}>{mentees.length}</div>
          <div style={s.statLabel}>Total Mentees</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: '#ecfdf5' }}>
            <TrendingUp size={18} color="#10b981" />
          </div>
          <div style={s.statValue}>{recent.length}</div>
          <div style={s.statLabel}>Signups (Last 30 days)</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: '#fffbeb' }}>
            <Calendar size={18} color="#f59e0b" />
          </div>
          <div style={s.statValue}>{monthKeys.length}</div>
          <div style={s.statLabel}>Active Months</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: '#f5f3ff' }}>
            <BarChart3 size={18} color="#8b5cf6" />
          </div>
          <div style={s.statValue}>
            {mentees.filter(m => ['4x Mentoring','2x Mentoring','1x Mentoring'].includes(m.status)).length}
          </div>
          <div style={s.statLabel}>Active in Program</div>
        </div>
      </div>

      <div style={s.twoCol}>
        {/* Signup Timeline */}
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Signups by Month</h2>
          {monthKeys.length === 0 ? (
            <p style={{ color: '#9ca3af', padding: '1rem' }}>No signup data yet.</p>
          ) : (
            <div style={s.barChart}>
              {monthKeys.slice(0, 12).map(key => {
                const count = byMonth[key].length
                const pct = Math.max(4, Math.round((count / maxCount) * 100))
                return (
                  <div key={key} style={s.barRow}>
                    <div style={s.barLabel}>{fmtMonth(key)}</div>
                    <div style={s.barTrack}>
                      <div style={{ ...s.barFill, width: `${pct}%` }} />
                    </div>
                    <div style={s.barCount}>{count}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Status Breakdown</h2>
          <div style={s.statusList}>
            {Object.entries(statusCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const color = STATUS_COLORS[status] || '#6b7280'
                const pct = Math.round((count / mentees.length) * 100)
                return (
                  <div key={status} style={s.statusRow}>
                    <div style={{ ...s.statusDot, background: color }} />
                    <div style={{ flex: 1 }}>
                      <div style={s.statusName}>{status}</div>
                      <div style={s.statusBar}>
                        <div style={{ ...s.statusBarFill, width: `${pct}%`, background: color + '40', borderColor: color }} />
                      </div>
                    </div>
                    <div style={{ ...s.statusCount, color }}>{count}</div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Funnel Report */}
      {funnelConfigLoaded && (
        <div style={s.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={s.panelTitle}>Mentee Funnel</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                Track progression through statuses and offerings. Toggle items to customize the view.
              </p>
            </div>
            {(funnelExcludedStatuses.length > 0 || funnelExcludedOfferings.length > 0) && (
              <button onClick={resetFunnelConfig} style={s.resetBtn}>
                <RotateCcw size={13} /> Reset to defaults
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {/* Funnel visualization */}
            <div style={{ flex: '2 1 400px' }}>
              {(() => {
                // Build funnel stages: statuses first (in order), then offerings
                const stages = []
                allStatuses
                  .filter(st => !funnelExcludedStatuses.includes(st))
                  .forEach(st => {
                    const count = mentees.filter(m => m.status === st).length
                    const sc = getStatusColor(st)
                    stages.push({ key: `status:${st}`, label: st, count, color: sc.color, type: 'status' })
                  })
                allOfferings
                  .filter(o => !funnelExcludedOfferings.includes(o.id))
                  .forEach(o => {
                    const count = offeringEnrollments[o.id] || 0
                    stages.push({ key: `offering:${o.id}`, label: o.name, count, color: o.offering_type === 'course' ? '#3b82f6' : '#8b5cf6', type: 'offering' })
                  })

                const maxCount = Math.max(...stages.map(s => s.count), 1)
                const total = mentees.length

                if (stages.length === 0) {
                  return <p style={{ color: '#9ca3af', padding: '1rem', textAlign: 'center' }}>No stages selected. Use the filters to add statuses or offerings.</p>
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {stages.map((stage, i) => {
                      const widthPct = Math.max(8, Math.round((stage.count / maxCount) * 100))
                      const pctOfTotal = total > 0 ? Math.round((stage.count / total) * 100) : 0
                      return (
                        <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: 130, flexShrink: 0, textAlign: 'right' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', lineHeight: 1.2 }}>{stage.label}</div>
                            <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                              {stage.type === 'offering' ? 'Offering' : 'Status'}
                            </div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ flex: 1, height: 28, backgroundColor: '#f3f4f6', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                              <div style={{
                                height: '100%',
                                width: `${widthPct}%`,
                                background: stage.color + 'cc',
                                borderRadius: 8,
                                transition: 'width 0.4s ease',
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: '0.5rem',
                              }}>
                                {stage.count > 0 && widthPct > 20 && (
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>{stage.count}</span>
                                )}
                              </div>
                            </div>
                            <div style={{ width: 48, textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: stage.color }}>{stage.count}</div>
                              <div style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{pctOfTotal}%</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Filter panel */}
            <div style={{ flex: '1 1 200px', maxWidth: 280 }}>
              <div style={s.filterPanel}>
                <div style={s.filterHeader}>
                  <Filter size={13} color="#6b7280" />
                  <span style={s.filterTitle}>Filter Stages</span>
                </div>

                <div style={s.filterSection}>
                  <div style={s.filterSectionTitle}>Statuses</div>
                  {allStatuses.map(st => {
                    const checked = !funnelExcludedStatuses.includes(st)
                    const sc = getStatusColor(st)
                    return (
                      <label key={st} style={s.filterItem}>
                        <input type="checkbox" checked={checked} onChange={() => toggleFunnelStatus(st)} style={s.checkbox} />
                        <span style={{ ...s.filterDot, background: sc.color }} />
                        <span style={s.filterLabel}>{st}</span>
                      </label>
                    )
                  })}
                </div>

                <div style={{ ...s.filterSection, borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                  <div style={s.filterSectionTitle}>Offerings</div>
                  {allOfferings.map(o => {
                    const checked = !funnelExcludedOfferings.includes(o.id)
                    const color = o.offering_type === 'course' ? '#3b82f6' : '#8b5cf6'
                    return (
                      <label key={o.id} style={s.filterItem}>
                        <input type="checkbox" checked={checked} onChange={() => toggleFunnelOffering(o.id)} style={s.checkbox} />
                        <span style={{ ...s.filterDot, background: color }} />
                        <span style={s.filterLabel}>{o.name}</span>
                      </label>
                    )
                  })}
                  {allOfferings.length === 0 && <div style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '0.25rem 0' }}>No offerings yet</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Course Completion Report */}
      <div style={s.panel}>
        <div style={s.completionHeader}>
          <div>
            <h2 style={s.panelTitle}>Course Completion</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>Select a course to view enrolled mentees and their progress</p>
          </div>
        </div>

        <div style={s.completionControls}>
          <select
            style={s.courseSelect}
            value={selectedOfferingId}
            onChange={e => setSelectedOfferingId(e.target.value)}
          >
            <option value="">— Select a course —</option>
            {courseOfferings.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          {selectedOfferingId && (
            <div style={s.toggleGroup}>
              <button
                style={displayMode === 'percentage' ? s.toggleActive : s.toggleInactive}
                onClick={() => setDisplayMode('percentage')}
              >
                <Percent size={13} /> Percentage
              </button>
              <button
                style={displayMode === 'count' ? s.toggleActive : s.toggleInactive}
                onClick={() => setDisplayMode('count')}
              >
                <Hash size={13} /> Count
              </button>
            </div>
          )}
        </div>

        {completionLoading && (
          <p style={{ color: '#9ca3af', padding: '1rem 0', textAlign: 'center' }}>Loading completion data…</p>
        )}

        {completionData && !completionLoading && (
          <>
            <div style={s.completionSummary}>
              <div style={s.completionStat}>
                <BookOpen size={15} color="#6366f1" />
                <span><strong>{completionData.totalLessons}</strong> lesson{completionData.totalLessons !== 1 ? 's' : ''} in course</span>
              </div>
              <div style={s.completionStat}>
                <Users size={15} color="#10b981" />
                <span><strong>{completionData.rows.length}</strong> mentee{completionData.rows.length !== 1 ? 's' : ''} enrolled</span>
              </div>
              {completionData.rows.length > 0 && (
                <div style={s.completionStat}>
                  <TrendingUp size={15} color="#f59e0b" />
                  <span>
                    <strong>
                      {Math.round(
                        completionData.rows.reduce((sum, r) => sum + (r.total > 0 ? r.completed / r.total : 0), 0)
                        / completionData.rows.length * 100
                      )}%
                    </strong> average completion
                  </span>
                </div>
              )}
            </div>

            {completionData.rows.length === 0 ? (
              <p style={{ color: '#9ca3af', padding: '1rem 0' }}>
                {completionData.totalLessons === 0
                  ? 'This course has no lessons yet. Add lessons in the Course Builder.'
                  : 'No mentees are enrolled in this course.'}
              </p>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.tableHead}>
                    <th style={s.th}>Mentee</th>
                    <th style={s.th}>Status</th>
                    <th style={{ ...s.th, width: 200 }}>Progress</th>
                    <th style={{ ...s.th, textAlign: 'right', width: 100 }}>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {completionData.rows.map(row => {
                    const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
                    const color = pct === 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : pct > 0 ? '#3b82f6' : '#d1d5db'
                    const statusColor = STATUS_COLORS[row.mentee.status] || '#6b7280'
                    return (
                      <tr key={row.mentee.id} style={s.tableRow}>
                        <td style={s.td}>
                          <strong>{row.mentee.first_name} {row.mentee.last_name}</strong>
                          {row.mentee.email && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{row.mentee.email}</div>}
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, background: statusColor + '18', color: statusColor }}>
                            {row.mentee.status || '—'}
                          </span>
                        </td>
                        <td style={s.td}>
                          <div style={s.progressBarTrack}>
                            <div style={{ ...s.progressBarFill, width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                          {displayMode === 'percentage'
                            ? `${pct}%`
                            : `${row.completed} / ${row.total}`
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {!selectedOfferingId && !completionLoading && (
          <div style={s.emptyState}>
            <BookOpen size={36} color="#d1d5db" strokeWidth={1.5} />
            <p style={{ color: '#9ca3af', margin: '0.5rem 0 0' }}>Select a course above to view completion data</p>
          </div>
        )}
      </div>

      {/* Recent signups table */}
      <div style={s.panel}>
        <h2 style={s.panelTitle}>Recent Signups</h2>
        {mentees.length === 0 ? (
          <p style={{ color: '#9ca3af', padding: '1rem' }}>No mentees yet.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.tableHead}>
                <th style={s.th}>Name</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Signed Up</th>
              </tr>
            </thead>
            <tbody>
              {mentees.slice(0, 25).map(m => {
                const color = STATUS_COLORS[m.status] || '#6b7280'
                const date = m.signup_date || m.created_at?.split('T')[0]
                return (
                  <tr key={m.id} style={s.tableRow}>
                    <td style={s.td}><strong>{m.first_name} {m.last_name}</strong></td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: color + '18', color }}>
                        {m.status || '—'}
                      </span>
                    </td>
                    <td style={s.td}>{date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const s = {
  header: { marginBottom: '1.75rem' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  sub: { color: '#9ca3af', fontSize: '0.875rem' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  statCard: { backgroundColor: '#fff', borderRadius: 8, padding: '1.1rem 1.25rem', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  statIcon: { width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.25rem' },
  statValue: { fontSize: '1.8rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1 },
  statLabel: { fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1rem' },
  panel: { backgroundColor: '#fff', borderRadius: 9, boxShadow: 'var(--shadow)', padding: '1.25rem', marginBottom: '1rem', border: '1px solid #f3f4f6' },
  panelTitle: { fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem' },
  barChart: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  barRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  barLabel: { fontSize: '0.78rem', color: '#6b7280', width: 68, flexShrink: 0 },
  barTrack: { flex: 1, height: 8, backgroundColor: '#f3f4f6', borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', background: 'var(--primary-gradient)', borderRadius: 99, transition: 'width 0.3s' },
  barCount: { fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', width: 24, textAlign: 'right' },
  statusList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '0.65rem' },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  statusName: { fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.2rem' },
  statusBar: { height: 5, backgroundColor: '#f3f4f6', borderRadius: 99, overflow: 'hidden' },
  statusBarFill: { height: '100%', border: '1px solid', borderRadius: 99 },
  statusCount: { fontSize: '0.85rem', fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHead: { borderBottom: '1.5px solid #f3f4f6' },
  th: { padding: '0.6rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tableRow: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '0.7rem 0.75rem', fontSize: '0.875rem', color: '#374151' },
  badge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 5, fontSize: '0.75rem', fontWeight: 600 },
  completionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' },
  completionControls: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' },
  courseSelect: { padding: '0.55rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', color: '#111827', backgroundColor: '#fff', minWidth: 260, cursor: 'pointer' },
  toggleGroup: { display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 9, overflow: 'hidden' },
  toggleActive: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', backgroundColor: '#6366f1', color: '#fff', border: 'none', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  toggleInactive: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', backgroundColor: '#fff', color: '#6b7280', border: 'none', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' },
  completionSummary: { display: 'flex', gap: '1.5rem', padding: '0.75rem 0', marginBottom: '0.5rem', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' },
  completionStat: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#374151' },
  progressBarTrack: { height: 8, backgroundColor: '#f3f4f6', borderRadius: 99, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 99, transition: 'width 0.3s' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 1rem' },
  // Funnel report styles
  resetBtn: {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.45rem 0.85rem', background: '#f1f5f9', border: '1px solid #e2e8f0',
    borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, color: '#64748b',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  filterPanel: {
    background: '#f9fafb', borderRadius: 9, border: '1px solid #f3f4f6',
    padding: '0.85rem',
  },
  filterHeader: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    marginBottom: '0.75rem',
  },
  filterTitle: {
    fontSize: '0.72rem', fontWeight: 700, color: '#374151',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  filterSection: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  filterSectionTitle: {
    fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: '0.25rem',
  },
  filterItem: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.2rem 0', cursor: 'pointer', fontSize: '0.82rem',
  },
  checkbox: { accentColor: '#6366f1', margin: 0, cursor: 'pointer' },
  filterDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  filterLabel: { color: '#374151', fontWeight: 500 },
}
